# Plan: `EmployeeRecord` — a person-centric identity hub

**Status:** Phases 0–3 implemented. Phase 3 delivers the feature: onboarding an existing staff member with no application.

> **Phase 3 delivered:** `applicationId` is now optional on OnboardingInvite/
> OnboardingResponse/ApplicationDocument; uniqueness moved to `employeeRecordId`
> (partial). Migration `013` drops the legacy application-keyed unique indexes and
> builds the record-keyed ones (with a duplicate guard). New `staff-invite` API +
> record-based track API (shared core `onboardingTrackCore.ts`, serving both the
> applicant `[applicationId]` route and the new `by-record/[recordId]` route),
> record-based onboarding page `/onboarding/r/[employeeRecordId]` (shared
> `OnboardingClient`), and an "Onboard existing staff" admin modal. **Deploy
> order:** deploy the code, then run `013` (after `012`). Follow-up (not in this
> phase): record-based revoke/regenerate management for staff invites.

> **Phase 2 re-scope (decided during implementation):** under the chosen "relax
> only, keep applicationId required" option, the index relaxation and record-scoped
> onboarding reads turn out to belong in **Phase 3** — they're only needed for a
> staff member with *no* application (nullable `applicationId`). Switching the
> onboarding *track* reads to `employeeRecordId` now would also leak a person's
> other applications into a single-application view. So **Phase 2 = person-centric
> compliance materialization only** (safe groundwork, no behavior change for
> single-application users); **Phase 3** now owns nullable `applicationId`, the
> index migration (`013`), record-scoped reads, and the staff entry point.
>
> **Phase 2 delivered:** `linkApplicationDocumentsToStaff` ([documentHelpers.ts](../src/lib/documentHelpers.ts))
> resolves the application's `EmployeeRecord`, materializes the person's verified
> documents across all their applications, and keys compliance on `record.staffId`
> — each with a fallback to the previous application-scoped behavior.
**Author:** drafted with Claude Code
**Decision inputs (confirmed):** phased — *full plan first*; identity is *email-primary
with manual merge*.

> **Phase 0 delivered:** `src/models/EmployeeRecord.ts` + `migrations/011-seed-employee-records.js`.
> Additive and read-only for existing collections; nothing in the app reads
> `EmployeeRecord` yet. Preview with `node migrations/011-seed-employee-records.js --dry-run`.
>
> **Phase 1 delivered:** optional `employeeRecordId` added to `JobApplication`,
> `OnboardingInvite`, `OnboardingResponse`, `ApplicationDocument`, **dual-written**
> on every create path via `src/lib/employeeRecord.ts` (`resolveEmployeeRecordIdByEmail`,
> best-effort — never blocks the primary write). `migrations/012-backfill-employee-record-links.js`
> backfills existing rows. Still no reads switched. **Deploy order:** merge/deploy
> the Phase 1 code first (new rows get the id), then run `012` to backfill old rows.

---

## 1. Why

Onboarding, applications, documents, and compliance are all keyed to a
`JobApplication._id`. That blocks three things we actually want:

1. **Onboard an existing staff member** who never had an application.
2. **One person, many positions** — an applicant who applies to 3 jobs is 3
   unrelated `JobApplication` rows today; their verified documents are stranded
   on whichever application they uploaded to.
3. **A stable identity** that survives the applicant → hired → staff transition
   instead of the implicit `applicantEmail` ↔ `acceptedStaffId` ↔ `staffid`
   thread we reconcile by hand.

`EmployeeRecord` is the **Party/Person** pattern: one durable record per human,
holding their application ids, their onboarding, their documents, and — once
hired — their `staffId`.

### What it replaces (the two rejected alternatives)

- **Option A (synthetic `JobApplication` per staff):** works, but pollutes the
  candidate list and hiring funnel with fake applications and needs an `origin`
  flag to filter everywhere. A synthetic application is really "a record without
  the abstraction."
- **Option B (polymorphic `{application|staff}` owner on documents):** forces a
  *fork* in the verify→materialize path (application-owned vs staff-owned) and
  `$or` queries across two owner columns. `EmployeeRecord` **removes that fork** —
  there is one owner type (the record), and the verify path just checks whether
  `record.staffId` is set.

---

## 2. The model

New file `src/models/EmployeeRecord.ts`:

```ts
EmployeeRecord {
  _id            : ObjectId
  email?         : string        // normalized lowercase; unique-sparse
  staffId?       : string        // Perfex staffid; unique-sparse
  name           : string
  applicationIds : ObjectId[]    // ref JobApplication — one per position applied
  status         : 'lead' | 'applicant' | 'onboarding' | 'staff' | 'inactive'
  primaryEmailSource? : 'application' | 'staff' | 'manual'
  mergedFrom?    : ObjectId[]    // audit: record ids absorbed via manual merge
  createdAt / updatedAt
}
```

**Invariant:** a record must have **at least one** of `email` / `staffId`.

**Indexes:**

- `email_1` — **unique, sparse** (unique only among records that have an email).
- `staffId_1` — **unique, sparse**.
- `applicationIds_1` — multikey, for "which record owns this application?".

`status` is a denormalized convenience (drives admin filtering); the source of
truth is still the underlying application/staff docs. Lifecycle:
`lead`→`applicant` (has an application) → `onboarding` (active invite) →
`staff` (staffId set) → `inactive` (terminated).

`EmployeeRecord` does **not** duplicate application or staff data — it references.
Name is denormalized for display and picked from the best available source
(latest application name, else Staff name).

---

## 3. Identity & merge rules (email-primary, manual merge)

This is the genuinely new logic. The rule set, in order:

### 3.1 Resolution (finding/creating the record for a subject)

- **From an application** (`applicantEmail = X`): find `EmployeeRecord{email: X}`
  (case-insensitive normalized). If none, create one with `email: X`, push the
  application id, `status: 'applicant'`.
- **From a staff member** (`staffId = S`, `email = Y?`):
  - find by `staffId: S` → use it.
  - else if `Y` present, find by `email: Y`; if found and it has **no** `staffId`,
    **auto-link** `staffId = S` onto it (this is the applicant→hired join).
  - else create a record with `staffId: S` (+ `email: Y` if present).

### 3.2 Auto-link is allowed ONLY on exact normalized-email match

`Staff.email === record.email` (case-insensitive, trimmed) → safe to set
`record.staffId`. This mirrors what `reconcileEmailKeyedCompliance`
([documentHelpers.ts:173](../src/lib/documentHelpers.ts#L173)) already does.

### 3.3 Everything else is a MANUAL merge

- Two records where **email differs but they're the same human** (applied as
  `jane@gmail`, Perfex has `jane@work`): never auto-merged. Surface a
  **"merge records"** admin action.
- A staff member with **no email**: record keyed by `staffId` only. To onboard,
  admin must **collect an email** (stored as `record.email`,
  `primaryEmailSource: 'manual'`) — access is email+HMAC, so an email is
  mandatory to send a link.

### 3.4 The merge operation

`mergeEmployeeRecords(keepId, absorbId)`:

1. Union `applicationIds`.
2. Re-point every `OnboardingInvite`, `OnboardingResponse`, `ApplicationDocument`
   from `absorbId` → `keepId` (see Phase 2 — they carry `employeeRecordId`).
3. Keep the non-null `email`/`staffId` (conflict = surface to admin, don't guess).
4. Push `absorbId` into `keep.mergedFrom`; delete the absorbed record.

Guardrails: refuse to auto-run if **both** records have a `staffId` and they
differ (that's two distinct staff — needs a human).

---

## 4. What attaches to the record — and what happens to documents

| Entity | Today | After |
|---|---|---|
| `JobApplication` | standalone, keyed by email string | referenced by `record.applicationIds[]`; gains `employeeRecordId` back-ref |
| `OnboardingInvite` | `applicationId` required + **unique** | owner becomes `employeeRecordId` (unique moves here); `applicationId` optional/provenance |
| `OnboardingResponse` | keyed `{applicationId, onboardingFormId}` | keyed `{employeeRecordId, onboardingFormId}` |
| `ApplicationDocument` | `applicationId` **required** | **owner becomes `employeeRecordId`**; `applicationId` optional provenance ("submitted while applying to position P") |
| `Staff` | linked via `JobApplication.acceptedStaffId` | linked via `record.staffId` (single hop) |

### Documents specifically (the crux of the earlier question)

Documents stop belonging to an *application* and start belonging to the *person*:

- `ApplicationDocument` gains `employeeRecordId` (indexed). `applicationId`
  becomes **optional** — retained only as provenance.
- **No data moves and nothing is lost.** Existing rows keep `applicationId`; the
  migration stamps their `employeeRecordId` from the application's email-record.
- **Documents now persist across positions and into staffhood automatically.**
  Re-apply next year → your verified TB Test is already on your record.
- **Dedup key** for a person's document of a given type becomes
  `{employeeRecordId, documentType}` (was `{applicationId, documentType}`).
- **Verify → materialize simplifies to a single path** (no Option-B fork):
  on verify, read `record.staffId`; if set, materialize straight into that
  staff's `StaffComplianceRecord`/`ComplianceEvidence` by the real `staffid`.
  If not yet hired, the document simply waits on the record — it materializes the
  moment `staffId` is stamped (applicant gets hired), no reconcile guesswork.

The model name `ApplicationDocument` becomes a mild misnomer ("a compliance
document owned by a person, first seen during an application"). We keep the name
to avoid a rename+migration and add a header comment; a future rename to
`ComplianceDocument` is optional and out of scope here.

---

## 5. Access flow

**No change to the token mechanism** — `createApplicationAccessLinkToken(email)` /
`verifyApplicationAccess(email, token)` stay email+HMAC
([applicationAccess.ts](../src/lib/applicationAccess.ts)). The onboarding routes
resolve `email → EmployeeRecord` instead of `email → JobApplication`. The
applicant-facing deep link can stay `/onboarding/<applicationId>` during
transition (it resolves to the owning record) and later gain a record-native
`/onboarding/r/<employeeRecordId>` form used by the staff entry point.

---

## 6. Phased, non-breaking migration

Each phase is independently shippable and additive. Reads don't switch to the new
key until the data behind it is fully backfilled (dual-write first).

### Phase 0 — model + backfill (read-only, nothing else changes)

- Add `src/models/EmployeeRecord.ts` (§2).
- Migration `011-seed-employee-records.js`:
  - Group all `JobApplication`s by normalized `applicantEmail` → one record each,
    `applicationIds` populated, `status` derived (`accepted`→`staff` if an
    `acceptedStaffId` exists, else `applicant`).
  - For every `Staff`: find record by `staffId`; else exact-email-match link;
    else create a `staffId`-keyed record (`status: 'staff'`, email if present).
  - Idempotent + re-runnable (upsert by email / staffId).
- **No app code reads it yet.** Pure data.

### Phase 1 — add `employeeRecordId` everywhere, dual-write

- Add optional `employeeRecordId` (indexed) to `OnboardingInvite`,
  `OnboardingResponse`, `ApplicationDocument`, and a back-ref on `JobApplication`.
- Migration `012-backfill-employee-record-links.js`: for each of those rows, set
  `employeeRecordId` from the application's email-record (from Phase 0).
- On the **write** paths (application submit, invite create, onboarding PATCH,
  document create), also **write** `employeeRecordId`. Keep `applicationId` too.
- Still no reads switched. Safe to deploy and verify counts match.

### Phase 2 — switch onboarding reads to the record; relax indexes

- Invite POST, track GET/PATCH, and document queries filter by
  `employeeRecordId` (resolved from the subject) instead of `applicationId`.
- Move `OnboardingInvite` unique index from `applicationId` →
  `employeeRecordId`; move `OnboardingResponse` unique compound to
  `{employeeRecordId, onboardingFormId}`. (Migration `013`, drops old indexes.)
- `linkApplicationDocumentsToStaff` reads by `employeeRecordId`; `record.staffId`
  is the compliance key. The email fallback is retained only for records not yet
  linked.
- Applicant experience unchanged (deep link resolves to the record).

### Phase 3 — staff-native onboarding entry point

- Admin "Onboard" can start from **any** `EmployeeRecord` — applicant or existing
  staff. New admin UI: pick a staff/record (search by name/staffid/email),
  collect an email if missing, generate the link.
- Because the subject is the record, the staff-with-no-application case now works
  with **zero** special-casing.

Rollback at any phase = stop writing/reading the new key; the old
`applicationId` paths are still intact through Phase 1–2.

---

## 7. Files touched (concrete, by the coupling map)

**New:** `src/models/EmployeeRecord.ts`, `src/lib/employeeRecord.ts` (resolve /
create / merge helpers), migrations `011`–`013`, admin route + modal for the
staff entry point (Phase 3), `docs/data-models.md` + `docs/diagrams.md` updates.

**Modified (Phase 1 dual-write):**
- `src/models/OnboardingInvite.ts`, `src/models/OnboardingResponse.ts`,
  `src/models/ApplicationDocument.ts`, `src/models/JobApplication.ts` — add
  `employeeRecordId`.
- Application submit route, `src/app/api/admin/onboarding/invite/route.ts`,
  `src/app/api/onboarding/track/[applicationId]/route.ts` — write the new key.

**Modified (Phase 2 read cutover):**
- `src/app/api/admin/onboarding/invite/route.ts` — resolve subject → record;
  drop the hard `status==='accepted'` gate in favor of a record-level rule.
- `src/app/api/onboarding/track/[applicationId]/route.ts` — `findApp` →
  `findRecord`; all `{applicationId}` doc/response queries → `{employeeRecordId}`.
- `src/lib/documentHelpers.ts` — `linkApplicationDocumentsToStaff` reads by record.
- `src/app/api/admin/documents/[docId]/verify/route.ts` — materialize via
  `record.staffId` (single path).
- `src/app/api/admin/onboarding/route.ts` + `OnboardingTab.tsx` — list records,
  not just accepted applications.

---

## 8. Edge cases & risks

- **Staff without email** → keyed by `staffId`; must collect an email before a
  link can be minted. Enforced in the Phase 3 UI.
- **Same person, two emails** → not auto-merged; manual merge action (§3.4).
- **Duplicate applications with the same email** → collapse into one record's
  `applicationIds` (a feature, not a conflict — dup applications are already
  allowed, [JobApplication.ts:18](../src/models/JobApplication.ts#L18)).
- **Legacy `applicationId_1` unique index** may exist on deployed
  `OnboardingResponse` collections ([OnboardingResponse.ts:107](../src/models/OnboardingResponse.ts#L107))
  — Phase 2 migration must drop it explicitly.
- **Perfex sync** keeps creating/updating `Staff` by `staffid`; a small reconcile
  step (extend the existing one) links new staff to their email-record.
- **Two records both with differing `staffId`** during a merge → blocked, needs a
  human.

---

## 9. Verification

1. Phase 0: record count == distinct application emails + staff-only people;
   spot-check a person who both applied and is staff → **one** record with both
   `email` and `staffId`.
2. Phase 1: every onboarding/response/document row has an `employeeRecordId`;
   counts match the pre-migration totals.
3. Phase 2: run an existing applicant through onboarding end-to-end (link, fill,
   upload, submit, verify) — behavior identical to today; verified doc still lands
   in the staff compliance record.
4. Phase 3: onboard an existing staff member with no application — link works,
   documents attach to their record, verify materializes to their `staffid`.
5. Merge: create two records for one human (different emails), merge, confirm
   applications/onboarding/documents all re-point and one record remains.

---

## 10. Recommendation & sequencing

Build **Phase 0 + 1 first** (model, backfill, dual-write) — they're additive,
reversible, and unlock everything else without changing any behavior. Review the
backfilled data, then proceed to the Phase 2 read cutover, and finally Phase 3's
staff entry point. Estimated: Phase 0–1 is the bulk of the *safe* work; Phase 2
is the behavioral cutover that needs the most testing; Phase 3 is mostly UI.

**Open decisions for later phases (not blocking Phase 0):**
- Route shape for the staff-native onboarding link (`/onboarding/r/<id>` vs reuse).
- Whether to rename `ApplicationDocument` → `ComplianceDocument` eventually.
- Exact admin merge UX (side-by-side compare + pick-winner).
