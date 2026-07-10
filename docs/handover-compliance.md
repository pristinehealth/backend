# Handover Notes and Compliance Work Plan

Date: 2026-07-01
Owner: Engineering handover
Scope: Careers application flow, candidate tracking, admin review, staff document visibility, and compliance architecture direction.

## 1) Current System State

### Functional areas in place
- Public jobs listing, job details, and application submission.
- Candidate tracking flow with OTP email verification and short-lived access token.
- Candidate edit capability when status is `changes_requested`.
- Admin application review with document verify/reject actions.
- Staff profile page showing submitted data and linked documents with expiry controls.

### Security and access controls currently in use
- OTP-based candidate access session model and token verification.
- Admin role checks for internal application and document review endpoints.
- Candidate endpoints require email plus temporary access token.

### Document handling status
- Document metadata supports `storageMode` with values `file` and `metadata_only`.
- Applicant-facing flows now hide metadata-only document types.
- Admin can record metadata-only documents internally without file upload.
- Applicant validation and submission now skip metadata-only document requirements.

## 2) Key Data Models in Use

- `JobApplication`: hiring submission and review state.
- `ApplicationDocument`: evidence submitted during application lifecycle.
- `StaffDocument`: staff-linked documents currently used by staff pages.
- `ApplicationAccessSession`: OTP/session for candidate tracking.

Important note:
- Compliance is currently spread across application and staff models, with fallback behavior from staff lookup to latest application documents when staff documents are missing.
- This is practical for continuity but is not a robust compliance domain model.

## 3) Known Architectural Gap

Current behavior mixes two concerns:
1. Hiring intake (application review and candidate progression)
2. Ongoing compliance governance (verification, expiry, reminders, audits)

This creates risks:
- Audit trails are fragmented.
- Compliance status can depend on application data structures.
- Internal compliance obligations are harder to enforce consistently.

## 4) Required Compliance Work (Must Do)

## Priority P0 (start immediately)

1. Create a dedicated compliance domain model
- Add `ComplianceRequirement` collection (policy definitions).
- Add `StaffComplianceRecord` collection (one per staff + requirement).
- Add `ComplianceEvidence` collection (file or metadata evidence, versioned history).
- Add `ComplianceEvent` collection (append-only audit events).

2. Separate hiring from compliance reads
- Staff and admin compliance pages must read from compliance collections, not `JobApplication` fallback data.
- Keep temporary fallback only during migration window.

3. Add explicit provenance and verification tracking
- Every compliance update must record:
  - actor (admin/system)
  - source (`applicant_upload`, `admin_upload`, `admin_metadata_record`, `migration_backfill`)
  - timestamp
  - reason/comment

4. Define storage rules per requirement type
- For sensitive IDs (for example state ID, work authorization, SSN), enforce `metadata_only` storage in compliance policy.
- For renewable certifications, allow file evidence + expiry lifecycle.

## Priority P1 (next sprint)

1. Backfill and migration
- Build idempotent migration job:
  - seed requirements
  - create compliance records for active staff
  - backfill evidence from existing `StaffDocument` and verified `ApplicationDocument`
  - write migration events in `ComplianceEvent`

2. Compliance APIs
- Add internal endpoints for:
  - listing requirements by staff member
  - recording metadata-only compliance receipt
  - uploading compliance evidence
  - verifying/rejecting evidence
  - setting expiry/review dates
  - reading timeline events

3. Reminder and escalation workflow
- Scheduled checks for upcoming expiries and overdue items.
- Event-driven notifications with dedupe controls.

## Priority P2 (hardening and governance)

1. Data governance and privacy
- Retention policies by requirement type.
- Deletion/archive workflows.
- Access restrictions by role and least privilege.

2. Reporting and audit exports
- Compliance posture dashboard:
  - compliant, pending, expired, missing
- Exportable audit report from event log.

3. Test coverage
- Model tests for status transitions.
- API tests for authorization and validation.
- Migration tests for idempotency and no data loss.

## 5) Proposed Compliance Schema (Initial)

### ComplianceRequirement
- `key`: string (unique)
- `label`: string
- `appliesToRoles`: string[]
- `evidenceMode`: `file | metadata_only | either`
- `requiresExpiry`: boolean
- `expiryCheckDays`: number
- `isMandatory`: boolean
- `active`: boolean

### StaffComplianceRecord
- `staffId`: string
- `staffEmail`: string
- `requirementKey`: string
- `status`: `missing | pending | verified | rejected | expired`
- `dueDate`: Date | null
- `expiryDate`: Date | null
- `verifiedAt`: Date | null
- `verifiedBy`: string | null
- `lastCheckedAt`: Date | null

Unique index: `(staffId, requirementKey)`

### ComplianceEvidence
- `recordId`: ObjectId
- `source`: `applicant_upload | admin_upload | admin_metadata_record | migration_backfill`
- `deliveryMethod`: `upload | email | manual`
- `fileUrl`: string
- `fileName`: string
- `metadata`: mixed
- `receivedAt`: Date
- `isCurrent`: boolean

### ComplianceEvent
- `recordId`: ObjectId
- `eventType`: `record_created | evidence_added | verified | rejected | expiry_set | reminder_sent | migrated`
- `actor`: string
- `payload`: mixed
- `createdAt`: Date

## 6) Transition Plan (Low Risk)

1. Introduce new models and APIs without removing current logic.
2. Dual-write new actions (admin verify/record expiry) to both old and new models.
3. Backfill compliance records and evidence for existing staff.
4. Switch staff UI/API reads to compliance domain.
5. Remove old fallback behavior after parity verification.

## 7) Operational Checklist for Handover

- Confirm OTP/email secrets are configured and rotation process exists.
- Confirm Cloudinary cleanup path for deleted applications and evidence.
- Confirm scheduled job ownership for reminder workflows.
- Confirm role matrix for admin/superadmin compliance actions.
- Confirm incident response owner for compliance data corrections.

## 8) Open Decisions Needed

1. Which staff roles require each compliance requirement?
2. Which requirement types are strictly metadata-only?
3. What are final retention periods by requirement category?
4. Should rejected evidence remain visible to all admins or only auditors?

## 9) Suggested Next Implementation Slice

- Build `ComplianceRequirement` and `StaffComplianceRecord` first.
- Add one internal endpoint: `GET /api/admin/compliance/staff/[staffId]`.
- Update staff detail page to read compliance records for status cards.
- Keep existing document panel read-only until evidence APIs are completed.

This document is the source handover baseline for compliance work kickoff.
