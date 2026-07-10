# Data Models

Every Mongoose model in `src/models/`, its fields, indexes, and how they relate.
Models use the hot-reload-safe idiom `mongoose.models.X || mongoose.model('X', schema)`.

Relationship map (hiring → staff → compliance):

```
JobPosition ──formId──▶ ApplicationForm
     ▲                         │ (customFields, documentRequirements)
     │ jobId                   ▼
JobApplication ──_id──▶ ApplicationDocument
     │  (applicantEmail)              │  verified docs copied on hire
     │                                ▼
ApplicationAccessSession        StaffDocument ◀──staffId── Staff ──email──▶ User (admin)
  (OTP + token by email)              │
                                      ▼ (backfill)
                             StaffComplianceRecord ──recordId──▶ ComplianceEvidence
                                      ▲                          ComplianceEvent
                                      │ requirementKey
                             ComplianceRequirement
```

---

## Hiring & candidate

### JobPosition — `src/models/JobPosition.ts`
A job opening.
- `title: string`
- `sections: { label, content }[]` — rich job description blocks
- `status: 'draft' | 'open' | 'closed'` — only `open` jobs are public/applyable
- `formId: ObjectId → ApplicationForm` — the form used to apply

### ApplicationForm — `src/models/ApplicationForm.ts`
Reusable form definition attached to jobs.
- `name: string` (unique)
- `customFields: CustomFieldDefinition[]` — dynamic questions (incl. non-compliance
  file uploads like résumés); **independent of the compliance catalog**
- `requiredDocuments`, `documentRequirements` — **legacy**. Required documents are
  now resolved from the compliance catalog (`collectAtApplication` + position), not
  these fields. Kept for back-compat; superseded by the catalog (the form builder
  now shows required docs read-only).
- Delete is blocked if any `JobPosition` still references the form.

### JobApplication — `src/models/JobApplication.ts`
A candidate's submission + review state.
- `jobId: ObjectId → JobPosition` (required)
- `applicantName: string`, `applicantEmail: string` (validated)
- `customFieldValues: Map<string, any>` — answers keyed by field name
- `status: 'pending' | 'reviewed' | 'shortlisted' | 'rejected' | 'accepted' | 'changes_requested'` (default `pending`)
- `notes: { author, text, createdAt }[]` — admin/system audit notes
- `accessCode: string` — internal reference generated at submission
- Index: `{ applicantEmail: 1, accessCode: 1 }`
- The model self-heals: if a cached schema is missing `changes_requested` in
  its status enum, it re-registers (see `JobApplication.ts:69-79`).

### ApplicationDocument — `src/models/ApplicationDocument.ts`
Evidence attached to an application.
- `applicationId: ObjectId → JobApplication` (required, indexed)
- `documentType: string` — **dynamic**: a `ComplianceRequirement.key` (no enum; see [documents-compliance.md](./documents-compliance.md))
- `deliveryMethod: 'upload' | 'email'`
- `fileUrl`, `fileName` (default `''` — empty for metadata-only receipts)
- `expiryDate?: Date`
- `status: 'pending' | 'verified' | 'rejected' | 'expired'` (default `pending`)
- `rejectionReason?: string`

### ApplicationAccessSession — `src/models/ApplicationAccessSession.ts`
OTP + short-lived token for candidate tracking (no account).
- `email: string` (unique, lowercased)
- `otpCode?`, `otpExpiry?` — 6-digit OTP, 10-min TTL
- `accessTokenHash?`, `accessTokenExpiry?` — SHA-256 of token, 30-min TTL

---

## Staff & access

### Staff — `src/models/Staff.ts`
Staff record mirrored from Perfex CRM; also backs mobile auth.
- `staffid: string` (unique) — Perfex ID, used everywhere as `staffId`
- `email`, `firstname`, `lastname`, `phonenumber`, `role`, `full_name`
- `admin: string` — `'1'` marks a Perfex administrator (gates admin registration)
- `active: string` — `'1'` active
- `role: string` — **owned by Perfex** (set/overwritten by sync); drives role targeting
- `positionId?`, `positionTitle?` — hired JobPosition, **stamped at accept** (Perfex
  never sends these, so the sync's `$set` leaves them intact); drives position targeting
- `customfields: Mixed[]`
- Mobile-auth fields: `otpCode`, `otpExpiry`, `passwordHash`, `emailVerified`,
  `isBackendRegistered`
- `activeTimer: { taskId, startTime }` — mobile task time tracking (unrelated to compliance)

### User — `src/models/User.ts`
Admin/back-office login (separate from Staff).
- `name`, `email`, `password` (bcrypt, `select:false`)
- `role: 'admin' | 'superadmin'` (default `admin`)

### StaffDocument — `src/models/StaffDocument.ts`
Documents linked to an active staff member (post-hire).
- `staffId: string` (indexed), `staffEmail: string` (indexed, lowercased)
- `documentType: string` — **dynamic**: a `ComplianceRequirement.key` (no enum)
- `deliveryMethod`, `fileUrl`, `fileName`
- `expiryDate?`, `uploadedAt`, `linkedAt`, `lastReminderSentAt?`
- `status: 'active' | 'expired' | 'pending_renewal'` (default `active`)
- Indexes: `{ staffEmail, documentType }`, `{ expiryDate, status }`

---

## Compliance domain (new)

See [documents-compliance.md](./documents-compliance.md) for the full narrative.

### ComplianceRequirement — `src/models/ComplianceRequirement.ts`
The catalog — single source of truth for every document/credential. `key` is
also the dynamic `documentType`.
- `key: string` (unique), `label`, `description`
- `appliesToRoles: string[]` — targeting by role
- `appliesToPositions: string[]` — targeting by JobPosition id; empty roles **and**
  empty positions = applies to everyone
- `collectAtApplication: boolean` — requested on job application forms
- `evidenceMode: 'file' | 'metadata_only' | 'either'`
- `requiresExpiry: boolean`, `expiryCheckDays: number`
- `isMandatory: boolean`, `active: boolean`

### StaffComplianceRecord — `src/models/StaffComplianceRecord.ts`
Authoritative compliance status, one per staff × requirement.
- `staffId` (indexed), `staffEmail` (indexed), `requirementKey`
- `status: 'missing' | 'pending' | 'verified' | 'rejected' | 'expired'`
- `dueDate?`, `expiryDate?`, `verifiedAt?`, `verifiedBy?`, `rejectionReason?`, `lastCheckedAt?`
- `assignedManually?: boolean` — admin attached it directly (bypasses targeting)
- Unique index: `{ staffId, requirementKey }`; plus `{ expiryDate, status }`

### ComplianceEvidence — `src/models/ComplianceEvidence.ts`
Versioned evidence per record.
- `recordId: ObjectId → StaffComplianceRecord` (indexed)
- `source: 'applicant_upload' | 'admin_upload' | 'admin_metadata_record' | 'migration_backfill'`
- `deliveryMethod: 'upload' | 'email' | 'manual'`
- `fileUrl`, `fileName`, `metadata: Mixed`, `receivedAt`, `isCurrent`
- Index: `{ recordId, isCurrent }`

### ComplianceEvent — `src/models/ComplianceEvent.ts`
Append-only audit log (no `updatedAt`).
- `recordId: ObjectId → StaffComplianceRecord` (indexed)
- `eventType: 'record_created' | 'evidence_added' | 'verified' | 'rejected' | 'expiry_set' | 'reminder_sent' | 'migrated'`
- `actor: string`, `payload: Mixed`, `createdAt`
- Index: `{ recordId, createdAt: -1 }`

---

## CRM read-model & ops

Synced from Perfex or used for operations:
- `Customer` (`userid`), `Project` (`id`), `Task` (`id`), `Timesheet` (`id`) —
  see [crm-sync.md](./crm-sync.md)
- `ServiceReport`, `Settings` (`{ key, value }` — stores sync schedule config),
  `UploadAsset` (Cloudinary upload lifecycle: `pending → consumed | deleted`)
