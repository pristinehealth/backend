# Hiring Flow (Careers)

The end-to-end path from a published job to a hired staff member, and the admin
tools that drive it.

```
draft job ──publish──▶ open job ──applicant applies──▶ JobApplication(pending)
                                                            │
   admin reviews docs (verify/reject) ◀── documents ───────┤
                                                            │
   admin sets status ─────────────────────────────────────┤
     reviewed / shortlisted / changes_requested / rejected / accepted
                                                            │
                              on hire: verified ApplicationDocuments
                              ──▶ StaffDocument (see documents-compliance.md)
```

---

## 1) Authoring jobs & forms (admin 🔴)

**Forms** are reusable and referenced by jobs. A form defines **questions**
(`customFields`); documents come from the compliance catalog (§3).
- New forms are pre-seeded with a **default candidate field set** (`DEFAULT_FORM_FIELDS`
  in `JobsTab.tsx`): name, birth date, phone, full address, profession,
  employment type, earliest start date, and nursing license *number* (optional).
  Admins can edit/remove any per form. Email is captured separately as
  `applicantEmail`. **Driver's License / ID is NOT a form field** — it re-verifies
  on expiry, so it lives entirely in compliance (`state_id`, now `requiresExpiry`).
- **Privacy Policy + Terms of Service consent** is a **built-in mandatory gate** on
  the apply page (not a removable field): the applicant must tick it (with links to
  `/privacy` and `/terms`) or the submit button stays disabled; the server also
  rejects submissions without it and records `JobApplication.termsAgreedAt`.
- Required fields reject empty values **and empty checkbox arrays** (validated on
  both the apply page and the server).
- `POST /api/admin/forms` — create. Validates `name` + non-empty `customFields`.
- `GET /api/admin/forms`, `GET/PUT/DELETE /api/admin/forms/[id]`. Rename checks
  for duplicates; **delete is blocked while a `JobPosition` references the form.**

**Jobs**:
- `POST /api/admin/jobs` — create as `draft` (requires `title` + ≥1 `sections`).
- `GET /api/admin/jobs`, `PATCH /api/admin/jobs/[id]` (`$set` with validators),
  `DELETE /api/admin/jobs/[id]`.
- `POST /api/admin/jobs/[id]/publish` — attach a `formId` (if provided),
  **require a form to be attached** (400 `NO_FORM_ATTACHED` otherwise), verify the
  form still exists, then set `status='open'`.

> **Note:** `GET/PUT/DELETE /api/admin/forms/[id]` and
> `POST /api/admin/jobs/[id]/publish` originally lacked an explicit role check;
> the standard `isAdmin()` guard (401 for non-admins) has since been added to
> match the list/create routes.

---

## 2) Public discovery (⚪ public)

- `GET /api/jobs` — lists only `status: 'open'`, newest first.
- `GET /api/jobs/[id]` — job + its form's `customFields` + normalized
  `requiredDocuments`/`documentRequirements`. Requirement precedence:
  form.documentRequirements → form.requiredDocuments → `DOCUMENT_METADATA`
  defaults (mandatory types).

Pages: `/jobs`, `/jobs/[id]`, `/jobs/[id]/apply`.

---

## 3) Application submission (⚪ public)

**`POST /api/jobs/[id]/apply`** — the core intake:
1. 404 if job missing; **400 unless `job.status === 'open'`**.
2. Require `applicantEmail`.
3. Resolve document requirements (form → job → metadata defaults).
4. **Validate custom fields**: required present; numbers parseable; checkbox
   values are arrays.
5. **Validate documents**: every required *file* type must have `fileUrl` +
   `fileName`; **metadata-only types are skipped** (never uploaded by applicants).
6. Derive `applicantName` from `first_name`/`last_name` fields if not given.
7. Generate an internal reference and create `JobApplication` (`status='pending'`,
   `accessCode=reference`).
8. Create `ApplicationDocument`s for submitted file docs (`status='pending'`).
9. Mark any `uploadedPublicIds` (`UploadAsset`) as `consumed` and link them to
   the application.

Files reach Cloudinary via `POST /api/applications/[id]/documents` (or the
pre-upload asset flow) — folder `pristine/applications/{appId}/documents`.

---

## 4) Admin review (admin 🔴)

- `GET /api/admin/applications?jobId=&status=` — list, enriched with job title +
  form custom fields.
- `DELETE /api/admin/applications/[id]` — remove an application.
- `POST /api/admin/applications/[id]/notes` — append an audit note; emails the
  **other** admins (unless `Settings.app_notify_status_change === 'false'`).
- `POST /api/admin/applications/[id]/documents/record` — record a
  **metadata-only** document receipt (no file); resets/creates the
  `ApplicationDocument` as `pending` and notes it on the application.

**Document verify/reject** — `PATCH /api/admin/documents/[docId]/verify`:
- `action: 'verify'` — set/compute `expiryDate` (explicit date, or
  `reviewIntervalDays` → today + N). Status becomes `verified`, or `expired` if
  the expiry is already past. Clears any rejection reason.
- `action: 'reject'` — `status='rejected'`, store `rejectionReason` (default
  "Rejected by admin"), and append a note to the application.

`ApplicationDocument` lifecycle:
```
pending ──verify──▶ verified   (or ▶ expired if expiryDate is past)
pending ──reject──▶ rejected
(any) ── re-review ──▶ verified/expired/rejected
```

---

## 5) Status changes & notifications (admin 🔴)

**`PATCH /api/admin/applications/[id]/status`** — validates against the allowed
set and `$set`s `status`. On success, unless
`Settings.app_notify_status_change === 'false'`, emails the applicant via
`sendApplicationStatusChangeEmail(email, name, jobTitle, status)`. Mail failures
are logged, not fatal.

`JobApplication` lifecycle (any transition is allowed — it's a free set, not a
strict state machine):
```
pending ─▶ reviewed ─▶ shortlisted ─▶ accepted
   └────────┴───────────┴──────────▶ rejected
   └──────────────────────────────▶ changes_requested ──(candidate edits)──▶ pending
```
- Initial status: `pending` (set at submission).
- `changes_requested` is the only status that lets a candidate edit (see
  [candidate-tracking.md](./candidate-tracking.md)); their save resets it to
  `pending`.

---

## 6) Hire → staff documents

**Trigger:** when the application status is set to **`accepted`**
(`PATCH /api/admin/applications/[id]/status`), the handler calls
`linkApplicationDocumentsToStaff(applicationId, staffEmail, staffId?)`
(`src/lib/documentHelpers.ts`).

What it does:
- Copies **only `verified`** `ApplicationDocument`s into `StaffDocument`s
  (`status='active'`, `linkedAt=now`).
- **Stamps the hired position** on the staff record (`positionId`/`positionTitle`
  from the job) — drives position-targeted compliance.
- Resolves the real Perfex `staffid` by looking up `Staff` by the applicant's
  email. If the person hasn't synced from Perfex yet, it falls back to keying the
  `StaffDocument` by **email** (a note records this).
- Is **idempotent** and **best-effort** — already-linked types are skipped;
  failures are logged and never block the status change or its email.
- Does **not** set `Staff.role` — role is owned by Perfex.

From there the staff document + compliance lifecycle takes over — see
[documents-compliance.md](./documents-compliance.md).

> **Accept-before-sync:** if the applicant isn't in `Staff` yet (not synced from
> Perfex), documents are keyed by email and position isn't stamped. This now
> **self-heals**: `reconcileEmailKeyedCompliance()` runs on every staff sync,
> re-keys the email-keyed data to the real `staffid`, and back-fills position.
> See [documents-compliance.md §9](./documents-compliance.md) and
> [diagram #14](./diagrams.md#14-accept-before-sync--reconciliation).
