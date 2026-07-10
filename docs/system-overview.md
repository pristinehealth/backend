# System Overview

How the backend works — architecture, domains, data models, auth, and data flow.

Companion to [`handover-compliance.md`](./handover-compliance.md), which covers
the compliance work plan specifically.

---

## 1) Stack

| Concern | Technology |
|---|---|
| Framework | Next.js 16 (App Router) + React 19 |
| Runtime server | Custom `server.js` (wraps Next + Socket.IO) |
| Database | MongoDB via Mongoose 9 |
| Auth (web/admin) | NextAuth 4 (Credentials provider, JWT sessions) |
| File storage | Cloudinary |
| Email | Resend + Nodemailer |
| Realtime | Socket.IO |
| Scheduling | `node-cron` (`cron.js`) |

Everything runs from the `backend/` package. API endpoints are Next.js route
handlers under `src/app/api/**/route.ts`; pages are under `src/app/**/page.tsx`.

### Entry points

- `server.js` — production/dev server. Boots Next, attaches Socket.IO, and
  triggers a hydration sync on startup (`POST /api/sync/all`).
- `cron.js` — standalone scheduled daemon: syncs data from Perfex CRM and sends
  document-expiry reminders. Run via `npm run sync` (and alongside the web
  server by `npm run dev`).
- `src/lib/mongoose.ts` — cached Mongoose connection helper (`dbConnect`) used by
  every route handler.

---

## 2) Domains

The backend spans six loosely-coupled domains:

1. **CRM sync** — mirrors staff/customers/projects/tasks/timesheets from an
   external **Perfex** CRM into MongoDB (read model for the app).
2. **Careers / hiring** — public job listings, application forms, application
   submission, document collection, and admin review.
3. **Candidate tracking** — lets applicants check/edit their application via an
   OTP-verified, short-lived access token.
4. **Staff & documents** — staff profiles and their linked documents with expiry
   tracking and reminders.
5. **Compliance** *(new)* — a dedicated compliance domain model that separates
   ongoing governance from hiring intake. See §7.
6. **Mobile API** — `/api/mobile/**` endpoints (auth, profile, tasks,
   timesheets) for the companion mobile app.

---

## 3) Data models

All models live in `src/models/` and use the shared registration idiom
(`mongoose.models.X || mongoose.model('X', schema)`) so they survive Next.js hot
reloads.

### Hiring & candidate
| Model | Purpose | Key fields |
|---|---|---|
| `JobPosition` | A job opening | `title`, `sections[]`, `status` (draft/open/closed), `formId` |
| `ApplicationForm` | Form definition for a job | `customFields[]`, `requiredDocuments[]`, `documentRequirements[]` |
| `JobApplication` | A submission + review state | `jobId`, `applicantName/Email`, `customFieldValues` (Map), `status`, `notes[]`, `accessCode` |
| `ApplicationDocument` | Evidence attached to an application | `applicationId`, `documentType`, `deliveryMethod`, `fileUrl/Name`, `expiryDate`, `status` |
| `ApplicationAccessSession` | OTP + access token for candidate tracking | `email`, `otpCode/Expiry`, `accessTokenHash/Expiry` |

### Staff & documents
| Model | Purpose | Key fields |
|---|---|---|
| `Staff` | Staff record (synced from Perfex) | `staffid`, `email`, `role`, `active`, `customfields[]`, plus app-auth fields (`otpCode`, `passwordHash`, `emailVerified`) |
| `User` | Admin/backoffice login | `email`, `password` (bcrypt), `role` (`admin`/`superadmin`) |
| `StaffDocument` | Documents linked to an active staff member | `staffId`, `staffEmail`, `documentType`, `fileUrl/Name`, `expiryDate`, `lastReminderSentAt`, `status` (active/expired/pending_renewal) |

### Compliance *(new — see §7)*
`ComplianceRequirement`, `StaffComplianceRecord`, `ComplianceEvidence`,
`ComplianceEvent`.

### CRM read-model / ops
`Customer`, `Project`, `Task`, `Timesheet`, `ServiceReport`, `Settings`,
`UploadAsset`.

---

## 4) Auth & access control

Three distinct auth mechanisms coexist:

**Admin (web).** NextAuth Credentials provider
(`src/app/api/auth/[...nextauth]/route.ts`). Validates against `User` (bcrypt),
issues a JWT whose `role` is copied onto `session.user.role`. Admin endpoints
gate on:

```ts
const session = await getServerSession(authOptions);
if (!session?.user?.role || !['admin', 'superadmin'].includes(session.user.role)) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}
```

> Note: `session.user.role` currently trips `tsc` project-wide because the
> next-auth `Session` type was never augmented. It works at runtime (the JWT
> callback sets it). A one-time `next-auth.d.ts` augmentation would clear this.

**Candidate (application tracking).** No account. The applicant requests an OTP
(`/api/applications/access/request`), verifies it
(`/api/applications/access/verify`) to receive a short-lived **access token**.
Tracking/edit endpoints require `email` + token, validated by
`verifyApplicationAccess()` in `src/lib/applicationAccess.ts` (token is stored
hashed with SHA-256; checked against `accessTokenExpiry`).

**Mobile.** OTP/password flows under `/api/mobile/auth/**` backed by the `Staff`
model's `otpCode`/`passwordHash`/`emailVerified` fields.

---

## 5) Document handling

Document types are **dynamic** — a `ComplianceRequirement.key`, not a fixed enum.
The compliance catalog is the single source of truth for documents (see §7 and
[documents-compliance.md](./documents-compliance.md)). `src/lib/documentMetadata.ts`
remains only as the built-in seed + a graceful fallback for the 10 legacy types.

Each requirement carries `label`, `evidenceMode`, expiry policy, `isMandatory`,
targeting, and `collectAtApplication`. Key distinction:

- **`evidenceMode`**: `file` (stored in Cloudinary) vs **`metadata_only`**
  (sensitive IDs — SSN, State ID, Work Authorization — where only a receipt is
  recorded, never the file itself) vs `either`.

Consequences of `metadata_only`:
- Applicant-facing flows hide these types; submission/validation skip their file
  requirements.
- Admins record receipt internally without an upload.

---

## 6) Core data flow

```
Applicant                    Admin                     System
    |                          |                          |
    |-- apply (jobs/[id]/apply)|                          |
    |   + upload/email docs -->|                          |
    |                          |-- review application     |
    |                          |-- verify/reject docs     |
    |                          |   (documents/[docId]/verify)
    |                          |-- record metadata-only receipt
    |                          |                          |
    |                          |-- hire / register in Perfex
    |                          |                          |
    |                          |     linkApplicationDocumentsToStaff()
    |                          |     ApplicationDocument(verified) --> StaffDocument
    |                          |                          |
    |                          |                    cron.js expiry sweep
    |                          |                    30/7-day reminder emails
```

1. **Apply** — applicant submits `JobApplication` + `ApplicationDocument`s
   (uploaded or emailed).
2. **Review** — admin verifies/rejects documents and moves application status
   (`pending → reviewed → shortlisted → accepted/rejected`, or
   `changes_requested` to send it back for candidate edits).
3. **Hire** — setting status to `accepted` calls
   `linkApplicationDocumentsToStaff()` (`src/lib/documentHelpers.ts`), which
   copies **verified** `ApplicationDocument`s into `StaffDocument`s (idempotent,
   best-effort; resolves `staffid` by email).
4. **Ongoing** — `cron.js` scans `StaffDocument.expiryDate` daily and emails
   reminders at **30 days** and **7 days** before expiry (deduped via
   `lastReminderSentAt`); the staff detail page manages expiry dates.

---

## 7) Compliance domain

The `ComplianceRequirement` catalog is the **single source of truth** for every
document/credential — driving both application intake and ongoing compliance
(full narrative + diagrams in [documents-compliance.md](./documents-compliance.md)).

### Models
| Model | Role |
|---|---|
| `ComplianceRequirement` | The catalog. `key` = the dynamic `documentType`. Carries targeting (`appliesToRoles`/`appliesToPositions`) and `collectAtApplication` |
| `StaffComplianceRecord` | Authoritative status per `(staffId, requirementKey)` (unique): `missing/pending/verified/rejected/expired`; `assignedManually` for manual attachments |
| `ComplianceEvidence` | Versioned evidence per record (file or metadata receipt); current row flagged `isCurrent` |
| `ComplianceEvent` | Append-only audit log (`record_created`, `verified`, `migrated`, …) |

### Targeting
A requirement applies to a staff member if **global** (no role/position), or their
`role` (Perfex) or `positionId` (stamped at accept) matches — plus **manual**
per-staff assignments. At application time only global + position apply.

### Read + write
- **Read**: `buildComplianceView(...)` returns one card per applicable requirement,
  falling back through legacy `StaffDocument` → verified `ApplicationDocument` while
  the migration completes.
- **Write**: `POST /api/admin/compliance/staff/[staffId]/[requirementKey]` —
  verify/reject/set_expiry/add_evidence/assign/unassign, each writing evidence +
  an audit event.

Managed from the **Compliance** dashboard tab (staff table + requirements config);
the staff detail page shows a compact status with a link into it.

### Migration / backfill
`migrations/` holds idempotent scripts (`npm run migrate:compliance`):
`001` seeds requirements; `002` creates records for active staff, backfills
evidence from existing documents, and writes audit events. See
[`migrations/README.md`](../migrations/README.md).

### Transition strategy (low risk)
Add models + read APIs → dual-write future admin actions to old + new → backfill
→ switch reads to the compliance domain → remove the fallback after parity. The
read-path fallback in `buildComplianceView` is what makes the staff page useful
*before* the backfill runs.

---

## 8) Background jobs (`cron.js`)

Runs independently of the web server (`npm run sync`, or bundled by `npm run dev`).

- **Perfex CRM sync** — paginated fetch of staff/customers/projects/tasks/
  timesheets into MongoDB using schemaless (`strict: false`) dynamic models.
  Stops before orphan-deletion if a page fetch fails (never deletes on partial
  data).
- **Document-expiry reminders** — daily scan of `StaffDocument`s with an
  `expiryDate`; sends reminder emails at 30 and 7 days out, recording
  `lastReminderSentAt` to avoid duplicates.

Manual triggers exist under `/api/cron`, `/api/sync/all`, `/api/sync/scoped`,
and `/api/mail/document-expiry-reminder`.

---

## 9) API surface (grouped)

- **Public careers** — `GET /api/jobs`, `GET /api/jobs/[id]`,
  `POST /api/jobs/[id]/apply`
- **Candidate tracking** — `/api/applications/access/{request,verify}`,
  `/api/applications/check`, `/api/applications/track/[id]`,
  `/api/applications/[id]/documents`
- **Admin hiring** — `/api/admin/applications[...]` (list/detail/status/notes/
  document record), `/api/admin/documents/[docId]/verify`,
  `/api/admin/jobs[...]`, `/api/admin/forms[...]`
- **Admin compliance** — `GET /api/admin/compliance/staff/[staffId]`
- **Staff** — `/api/staff`, `/api/staff/[id]`, `/api/staff/[id]/documents`,
  `/api/staff/documents[...]`, `/api/staff/auth-status`, `/api/staff/sync`
- **Mobile** — `/api/mobile/auth/**`, `/api/mobile/profile`,
  `/api/mobile/tasks[...]`, `/api/mobile/timesheets[...]`
- **Ops/sync** — `/api/sync/**`, `/api/cron`, `/api/upload`, `/api/settings`,
  plus CRM read endpoints (`/api/customers`, `/api/projects`, `/api/tasks`,
  `/api/timesheets`, `/api/contacts`, `/api/service-reports`)

---

## 10) Pages (web UI)

`/` (landing), `/login`, `/register`, `/dashboard` (admin),
`/jobs` + `/jobs/[id]` + `/jobs/[id]/apply` (public careers),
`/jobs/track` + `/jobs/track/[id]` (candidate tracking),
`/staff/[id]` (staff detail: profile, documents, compliance overview).

---

## 11) Running locally

```bash
cd backend
npm install
npm run dev        # web server (server.js) + Perfex sync/cron (cron.js)
# other scripts:
npm run start:web            # web server only
npm run sync                 # cron/sync daemon only
npm run migrate:compliance   # idempotent compliance backfill
npm run build && npm start   # production
```

Required env (`backend/.env`): `MONGO_URI`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`,
`CLOUDINARY_URL`, `EMAIL_FROM`, `RESEND_API_KEY`, `PERFEX_ENDPOINT`,
`PERFEX_ADMIN_TOKEN`.
