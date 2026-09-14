# Compliance Migrations

Idempotent migration scripts that stand up the compliance domain described in
[`docs/handover-compliance.md`](../docs/handover-compliance.md) (P1 → "Backfill and migration").

They follow the same runtime pattern as `cron.js`: plain CommonJS run with
`node`, `dotenv` for config, and schemaless dynamic Mongoose models so no
TypeScript compilation is required. Requires `MONGO_URI` in `backend/.env`.

## Run

```bash
# from backend/
npm run migrate:compliance          # runs all steps in order (recommended)

# or run a single step directly
node migrations/001-seed-compliance-requirements.js
node migrations/002-backfill-staff-compliance.js
```

All steps are **idempotent** — safe to run repeatedly.

## Steps

| # | File | What it does | Idempotency |
|---|------|--------------|-------------|
| 001 | `001-seed-compliance-requirements.js` | Upserts `ComplianceRequirement` docs from `data/complianceRequirements.js` | Upsert keyed on `key`; re-run updates definitions in place |
| 002 | `002-backfill-staff-compliance.js` | Creates a `StaffComplianceRecord` per active staff × requirement, backfills `ComplianceEvidence` from existing `StaffDocument` / verified `ApplicationDocument`, and writes `ComplianceEvent` audit rows | Records use `$setOnInsert` (existing records never overwritten); evidence + events written only on first insert |
| 011 | `011-seed-employee-records.js` | Seeds the person-centric `EmployeeRecord` hub (Phase 0): one record per human keyed by email and/or Perfex `staffId`, gathering their `applicationIds`. Additive — reads applications + staff, writes only `employeerecords`. Creates the unique partial indexes. | Upserts keyed on email / staffId; re-run converges. Ambiguous identity (email bound to a different staffId) is logged, never auto-merged |
| 012 | `012-backfill-employee-record-links.js` | Backfills `employeeRecordId` (Phase 1) on existing `JobApplication`, `OnboardingInvite`, `OnboardingResponse`, and `ApplicationDocument` rows, resolving each to its `EmployeeRecord` by applicationId then email. Run **after** the Phase 1 code deploys (which dual-writes new rows). | Only touches rows missing `employeeRecordId`; re-run is a no-op. Unresolved rows are logged (should be 0 after 011) |

## Collection-name safety

The new compliance collections are bound with **no explicit collection name**
and the **same model name** as `src/models/*.ts`, so Mongoose derives an
identical collection name to the Next.js app. Existing collections
(`staffs`, `staffdocuments`, `applicationdocuments`, `jobapplications`) are
bound with explicit names to match what the app already writes. See
[`lib/db.js`](./lib/db.js).

## Source of truth

`data/complianceRequirements.js` mirrors `COMPLIANCE_REQUIREMENT_SEED` in
`src/lib/compliance.ts` (itself derived from `DOCUMENT_METADATA`). If document
metadata changes, update that file and re-run step 001.

`appliesToRoles: []` currently means "applies to all roles" — replace with a
real role matrix once open decision #1 in the handover doc is resolved, then
re-run both steps (002 will create records for any newly-applicable pairs and
leave existing ones untouched).

## Rollback

These steps only add data to the four new compliance collections; they do not
modify `StaffDocument`, `ApplicationDocument`, or `JobApplication`. To fully
reverse during development, drop the compliance collections:

```js
// mongosh — DESTRUCTIVE, dev only
db.staffcompliancerecords.drop()
db.complianceevidences.drop()
db.complianceevents.drop()
db.compliancerequirements.drop()
```
