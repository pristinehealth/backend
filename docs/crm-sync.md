# CRM Sync & Scheduling

The app keeps a local MongoDB mirror of an external **Perfex** CRM, and runs
scheduled maintenance (expiry reminders, upload cleanup). Two independent
schedulers exist — understand which is which.

---

## 1) What gets synced

Perfex → MongoDB, paginated 50/page, authenticated with the `authtoken` header
(`PERFEX_ADMIN_TOKEN`) against `PERFEX_ENDPOINT`.

| Collection | Perfex endpoint | ID key | Notes |
|---|---|---|---|
| `staffs` | `/staffs` | `staffid` | |
| `customers` | `/customers` | `userid` | |
| `projects` | `/projects` | `id` | **`preserveCustomfields`** — won't overwrite locally-enriched customfields with empty ones |
| `tasks` | `/tasks` | `id` | |
| `timesheets` | `/timesheets` | `id` | |

Sync pattern (in `/api/sync/all` and `cron.js`):
1. Page through the resource, collecting `activeIds` and bulk upsert ops.
2. `bulkWrite` all upserts.
3. **Orphan prune**: `deleteMany({ [idKey]: { $nin: activeIds } })` — but **only
   if the fetch completed without error** (`!fetchError && activeIds.length > 0`).
   A failed page aborts pagination and **skips the delete** to avoid wiping live
   data on a transient network error.

> **Orphan-delete safety across the sync endpoints:**
> - `/api/sync/all` — guarded by an explicit `!fetchError && activeIds.length > 0` flag.
> - `/api/sync/scoped` — guarded implicitly: a failed page fetch **throws**, jumping
>   past the delete block to the per-resource `catch`, so pruning is skipped on
>   error. A clarifying comment now documents this so it isn't refactored away.
> - `/api/staff/sync` — **now** guards its single-shot delete with
>   `activeIds.length > 0` (previously unconditional), so a partial/empty Perfex
>   response can't wipe the collection.

---

## 2) Two schedulers

### A. In-process scheduler — `CronManager` (`src/lib/cronManager.ts`)
Drives the **data sync**. Not a cron string — it uses `setTimeout` and re-reads
its config from the `Settings` collection every cycle, so dashboard changes take
effect immediately.

- Modes (stored as `Settings` keys `sync_mode` / `sync_hour` / `sync_interval_minutes`):
  - **daily** (default) — runs at `sync_hour:00` (default 2, or `SYNC_HOUR`).
  - **interval** — every `sync_interval_minutes` (default 60).
- Each cycle POSTs `/api/sync/all`, then reschedules.
- Controlled via **`/api/cron`**: `GET` status; `POST { action: 'start' | 'stop' | 'reschedule', mode, hour, intervalMinutes }`
  (reschedule validates + persists to `Settings`, then re-arms).

**Boot** (`server.js`): after Next warms up (~1.5s), it POSTs `/api/cron`
`{action:'start'}` to arm the schedule, then fire-and-forget POSTs
`/api/sync/all` to hydrate an empty DB. It also attaches Socket.IO (JWT-authed;
each staff joins room `staff:${staffId}`) and exposes `global._io`.

### B. Standalone daemon — `cron.js` (`npm run sync`)
Separate process (also launched alongside the web server by `npm run dev`). Uses
`node-cron` with fixed schedules and its own schemaless Mongo models:

- **`0 <SYNC_HOUR> * * *`** (default 02:00 UTC) — full Perfex sync
  (`staffs, customers, projects, tasks, timesheets`) with the same orphan-safety
  guard as `/api/sync/all`.
- **`0 8 * * *`** (08:00 UTC) — `checkDocumentExpiries()` + abandoned-upload
  cleanup.

---

## 3) Document-expiry reminders (`cron.js checkDocumentExpiries`)

Scans `staffdocuments` where `expiryDate` exists and `status ∈ {active, pending_renewal}`.
For each doc it computes `daysUntilExpiry` and:

| Condition | Action |
|---|---|
| `daysUntilExpiry === 30` and no reminder in last 24h | send **30-day** reminder |
| `daysUntilExpiry === 7` and no reminder in last 24h | send **7-day** reminder |
| `daysUntilExpiry <= 0` and status `active` | mark `status = 'expired'` (one-time) |

Reminders POST `/api/mail/document-expiry-reminder` with
`{ to, staffName, documentType, expiryDate, daysUntilExpiry }`; on success
`lastReminderSentAt` is stamped (the 24h dedupe key). That endpoint is
origin-guarded (internal callers only in production) and sends via
`sendDocumentExpiryReminder` (`src/lib/mailer.ts`), resolving the human label with
`getDocumentLabel`.

> **Milestone precision:** reminders fire on the **exact** day counts (30 and 7).
> If the daily job doesn't run on those exact days (downtime), that milestone is
> skipped — there's no "≤30" catch-up window. Worth hardening if reliability
> matters.

---

## 4) Abandoned-upload cleanup (`cron.js`)

Finds `uploadassets` with `status='pending'` and `expiresAt <= now`, deletes each
from Cloudinary (trying `image`/`raw`/`video` resource types), and marks them
`status='deleted'` with `deletedAt`. This reclaims files from applicants who
started but never submitted.

---

## 5) Manual triggers

| Endpoint | Purpose |
|---|---|
| `POST /api/sync/all` | Full sync of all 5 resources |
| `POST /api/sync/scoped` `{ resources: [...] }` | Sync a chosen subset (orphan delete skipped on fetch error via throw) |
| `POST /api/staff/sync` | Staff-only, single-shot, no pagination (orphan delete guarded by `activeIds.length > 0`) |
| `GET/POST /api/cron` | Query / control the in-process scheduler |
| `POST /api/mail/document-expiry-reminder` | Send one reminder email (internal-origin only) |

---

## 6) Environment

`MONGO_URI`, `PERFEX_ENDPOINT`, `PERFEX_ADMIN_TOKEN` are required for sync.
`SYNC_HOUR` sets the default daily hour. `CLOUDINARY_URL` powers upload cleanup.
`RESEND_API_KEY` / `EMAIL_FROM` power reminder emails (logged to stdout if unset).
