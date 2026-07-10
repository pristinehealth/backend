# API Reference

Endpoint catalog grouped by area. Auth badges: 🔴 admin/superadmin (NextAuth) ·
🟡 candidate access token · 🟢 mobile JWT · ⚪ public · 🔵 mixed (applicant-or-admin).

For behavior detail, follow the domain-doc links.

---

## Public careers — see [hiring-flow.md](./hiring-flow.md)

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/jobs` | ⚪ | List `open` jobs |
| GET | `/api/jobs/[id]` | ⚪ | Job detail + form + **catalog-derived** required docs |
| POST | `/api/jobs/[id]/apply` | ⚪ | Submit application; docs validated against the catalog |

## Candidate tracking — see [candidate-tracking.md](./candidate-tracking.md)

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/applications/access/request` | ⚪ | Email a 6-digit OTP (10-min TTL) |
| POST | `/api/applications/access/verify` | ⚪ | OTP → access token (30-min TTL) |
| POST | `/api/applications/check` | 🟡 | List my applications |
| GET | `/api/applications/track/[id]` | 🟡 | One application + form + docs + `canEdit` |
| PATCH | `/api/applications/track/[id]` | 🟡 | Edit (only if `changes_requested`) → `pending` |
| DELETE | `/api/applications/track/[id]` | 🟡 | Delete application + docs + Cloudinary files |
| GET | `/api/applications/[id]/documents` | 🔵 | List an application's documents |
| POST | `/api/applications/[id]/documents` | 🔵 | Upload a document to Cloudinary |

## Admin — hiring — see [hiring-flow.md](./hiring-flow.md)

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/admin/applications` | 🔴 | List applications (`?jobId=&status=`), enriched |
| DELETE | `/api/admin/applications/[id]` | 🔴 | Delete application |
| GET | `/api/admin/applications/[id]` | 🔴 | Application detail |
| PATCH | `/api/admin/applications/[id]/status` | 🔴 | Change status (emails applicant; on `accepted`, links verified docs → StaffDocument) |
| POST | `/api/admin/applications/[id]/notes` | 🔴 | Add note (+ notify other admins) |
| POST | `/api/admin/applications/[id]/documents/record` | 🔴 | Record metadata-only doc receipt |
| PATCH | `/api/admin/documents/[docId]/verify` | 🔴 | Verify/reject a document |
| GET/POST | `/api/admin/jobs` | 🔴 | List / create jobs |
| PATCH/DELETE | `/api/admin/jobs/[id]` | 🔴 | Update / delete a job |
| POST | `/api/admin/jobs/[id]/publish` | 🔴 | Attach form + set `open` |
| GET/POST | `/api/admin/forms` | 🔴 | List / create forms |
| GET/PUT/DELETE | `/api/admin/forms/[id]` | 🔴 | Get / update / delete form |

## Admin — compliance — see [documents-compliance.md](./documents-compliance.md)

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/admin/compliance/staff` `?search=&page=` | 🔴 | Paginated staff list + compliance summary each (dashboard table) |
| GET | `/api/admin/compliance/staff/[staffId]` | 🔴 | Compliance cards + summary for one staff member |
| POST | `/api/admin/compliance/staff/[staffId]/[requirementKey]` | 🔴 | Edit action: `verify` / `reject` / `set_expiry` / `add_evidence` / `assign` / `unassign` |
| GET/POST | `/api/admin/compliance/requirements` | 🔴 | List (auto-seeds) / create a requirement |
| PATCH/DELETE | `/api/admin/compliance/requirements/[key]` | 🔴 | Edit / delete a requirement (delete blocked if records reference it) |
| GET | `/api/admin/compliance/retention` | 🔴 | Archived (terminated) staff + per-item retention state (dashboard) |
| GET/POST | `/api/admin/compliance/dispose` | 🔴 | Retention disposal — **dry-run** by default; `POST {dryRun:false, staffId?}` deletes ([retention.md](./retention.md)) |

## Staff & documents — see [documents-compliance.md](./documents-compliance.md)

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/staff` | 🔴 | List staff |
| GET | `/api/staff/[id]` | 🔵 | Staff profile (admin, or the staff member themselves) |
| GET/POST | `/api/staff/[id]/documents` | 🔴/self | Staff documents for an id |
| GET | `/api/staff/documents?email=|staffId=` | 🔴 | Staff docs (falls back to application docs) |
| PATCH | `/api/staff/documents/[docId]` | 🔴 | Set/clear expiry (auto-resolves status) |
| GET | `/api/staff/auth-status` | 🔴 | Per-staff app-registration/verification flags |
| POST | `/api/staff/sync` | 🔴 | Staff-only Perfex sync (+ compliance key reconciliation) |

🔵 `/api/staff/[id]` GET: requires a session; admins see any profile, a staff
member may view only their own (email match), else 401/403.

## Mobile — see [auth-and-access.md](./auth-and-access.md)

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/mobile/auth/signup` | ⚪ | Create app login for existing staff |
| POST | `/api/mobile/auth/verify-email` | ⚪ | Confirm signup via OTP → JWT |
| POST | `/api/mobile/auth/login` | ⚪ | Password login → JWT |
| POST | `/api/mobile/auth/request-otp` | ⚪ | Send OTP (reset/verify) |
| POST | `/api/mobile/auth/verify-otp` | ⚪ | Validate OTP → JWT |
| POST | `/api/mobile/auth/reset-password` | ⚪ | Reset password via OTP |
| GET/DELETE | `/api/mobile/profile` | 🟢 | Read / delete own profile |
| GET/POST | `/api/mobile/tasks`, `/api/mobile/tasks/[id]` | 🟢 | Task list / detail |
| GET/POST | `/api/mobile/timesheets`, `/[id]`, `/action` | 🟢 | Timesheets + start/stop actions |

## Ops / sync — see [crm-sync.md](./crm-sync.md)

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/sync/all` | — | Full Perfex sync (orphan-safe; + compliance key reconciliation) |
| POST | `/api/sync/scoped` | — | Sync chosen resources (orphan delete skipped on fetch error) |
| GET/POST | `/api/cron` | — | Query / control the in-process scheduler |
| POST | `/api/mail/document-expiry-reminder` | internal | Send one expiry reminder (origin-guarded) |
| POST | `/api/upload` | — | Cloudinary upload asset intake |

## CRM read model

Straight reads of the synced mirror: `/api/customers`, `/api/projects`,
`/api/tasks`, `/api/timesheets`, `/api/contacts`, `/api/service-reports`,
`/api/settings`.

---

## Hardening applied (surfaced while documenting — now fixed)

- `POST /api/admin/jobs/[id]/publish` and `GET/PUT/DELETE /api/admin/forms/[id]`
  — added the standard `isAdmin()` guard (401 for non-admins).
- `GET /api/staff/[id]` — added an auth guard (admin, or the staff member viewing
  their own record by email; 401/403 otherwise).
- `POST /api/staff/sync` — orphan delete now guarded by `activeIds.length > 0`.
  `POST /api/sync/scoped` was already protected (a failed fetch throws before the
  delete); a clarifying comment now documents that.
- Added `src/types/next-auth.d.ts` augmenting `Session`/`User`/`JWT` with
  `role`/`id`, clearing the project-wide `session.user.role` `tsc` errors.

### Remaining known `tsc` errors (pre-existing, unrelated)

- `applications/track/[id]/route.ts` and `staff/[id]/route.ts` — `customFieldValues`
  is a Mongoose `Map`; indexing it with `[field.name]` trips TS7052/TS2740.
- `dashboard/page.tsx`, `register/page.tsx` — unrelated UI type mismatches.
