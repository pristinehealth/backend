# System Diagrams

Visual companions to the written docs. These use **Mermaid** — they render in
VS Code's Markdown preview (Cmd/Ctrl-Shift-V) and on GitHub. If you see raw code,
install a Mermaid preview extension or view on GitHub.

Jump to: [Architecture](#1-architecture--context) ·
[Data model](#2-data-model-er) · [Hiring flow](#3-hiring-flow-sequence) ·
[Candidate access](#4-candidate-access-sequence) ·
[Application status](#5-application-status-state-machine) ·
[Document & compliance status](#6-document--compliance-status) ·
[Compliance read path](#7-compliance-read-path-fallback) ·
[CRM sync & scheduling](#8-crm-sync--scheduling) · [Auth](#9-auth-mechanisms) ·
[Compliance migration](#10-compliance-migration)

**Compliance deep-dives:** [Unified catalog](#11-unified-document--compliance-catalog) ·
[Requirement targeting](#12-requirement-targeting) ·
[Editing staff compliance](#13-editing-a-staffs-compliance) ·
[Accept-before-sync & reconciliation](#14-accept-before-sync--reconciliation)

---

## 1) Architecture / context

How the pieces fit. One Next.js app (web + API), one Mongo mirror, and external
systems it talks to.

```mermaid
flowchart TB
    subgraph clients["Clients"]
        WEB["Admin dashboard (web)"]
        CAND["Job applicants (browser)"]
        MOBILE["Mobile app (staff)"]
    end

    subgraph app["Next.js app (server.js)"]
        API["API routes /api/**"]
        PAGES["Pages /jobs, /staff, /dashboard"]
        IO["Socket.IO (staff rooms)"]
    end

    subgraph jobs["Background jobs"]
        CRON["cron.js daemon"]
        SCHED["CronManager (in-process)"]
    end

    DB[("MongoDB")]
    PERFEX["Perfex CRM"]
    CLOUD["Cloudinary"]
    MAIL["Email (Resend / Nodemailer)"]

    WEB --> PAGES
    WEB --> API
    CAND --> PAGES
    CAND --> API
    MOBILE --> API
    MOBILE -. websocket .-> IO

    API --> DB
    PAGES --> API
    API --> CLOUD
    API --> MAIL

    SCHED -->|POST /api/sync/all| API
    CRON -->|pull, paginated| PERFEX
    CRON --> DB
    CRON -->|POST reminder| API
    API -->|sync| PERFEX

    CRON -. cleanup .-> CLOUD
```

---

## 2) Data model (ER)

Key entities and how they relate. See [data-models.md](./data-models.md) for full
field lists.

```mermaid
erDiagram
    JobPosition ||--o| ApplicationForm : "uses (formId)"
    JobPosition ||--o{ JobApplication : "receives"
    JobApplication ||--o{ ApplicationDocument : "has"
    JobApplication ||..|| ApplicationAccessSession : "by email (OTP)"

    Staff ||--o{ StaffDocument : "owns"
    Staff ||--o{ StaffComplianceRecord : "measured by"
    Staff }o..o{ JobApplication : "same email (on hire)"
    Staff }o..o| JobPosition : "positionId (stamped at accept)"

    ApplicationDocument }o..o{ StaffDocument : "verified copied on accept"

    ComplianceRequirement ||--o{ StaffComplianceRecord : "defines (requirementKey)"
    ComplianceRequirement }o..o{ JobPosition : "appliesToPositions (targeting)"
    ComplianceRequirement ||..o{ ApplicationDocument : "collectAtApplication drives"
    StaffComplianceRecord ||--o{ ComplianceEvidence : "versioned evidence"
    StaffComplianceRecord ||--o{ ComplianceEvent : "audit log"

    User ||..|| Staff : "admin login (by email)"
```

> `documentType` (on ApplicationDocument / StaffDocument) and `requirementKey`
> (on StaffComplianceRecord) are the **same dynamic key** — a
> `ComplianceRequirement.key`. There is no fixed document enum anymore.

---

## 3) Hiring flow (sequence)

From published job to hired staff. See [hiring-flow.md](./hiring-flow.md).

```mermaid
sequenceDiagram
    autonumber
    actor A as Applicant
    participant API as API
    participant DB as MongoDB
    participant CL as Cloudinary
    actor AD as Admin

    Note over AD,DB: Setup
    AD->>API: create form + job (draft)
    AD->>API: POST /admin/jobs/:id/publish
    API->>DB: job.status = open

    Note over A,CL: Apply
    A->>API: GET /jobs/:id (form + required docs)
    A->>API: upload file docs
    API->>CL: store file
    A->>API: POST /jobs/:id/apply
    API->>DB: JobApplication(pending) + ApplicationDocument(pending)

    Note over AD,DB: Review
    AD->>API: PATCH /admin/documents/:docId/verify
    API->>DB: doc -> verified / rejected (+ note)
    AD->>API: PATCH /admin/applications/:id/status
    API->>DB: status change
    API-->>A: status email

    Note over AD,DB: Hire (status = accepted)
    AD->>API: PATCH status = accepted
    API->>DB: linkApplicationDocumentsToStaff() copies verified docs -> StaffDocument (idempotent)
```

---

## 4) Candidate access (sequence)

OTP → short-lived token → track/edit. See
[candidate-tracking.md](./candidate-tracking.md).

```mermaid
sequenceDiagram
    autonumber
    actor C as Candidate
    participant API as API
    participant DB as MongoDB
    participant M as Email

    C->>API: POST /applications/access/request {email}
    API->>DB: store 6-digit OTP (10 min TTL)
    API->>M: email OTP
    M-->>C: code

    C->>API: POST /applications/access/verify {email, code}
    API->>DB: validate OTP -> store SHA-256(token), 30 min TTL
    API-->>C: accessToken

    C->>API: GET /applications/track/:id (email + token)
    API->>DB: verifyApplicationAccess() + load app
    API-->>C: application + form + docs + canEdit

    alt status == changes_requested
        C->>API: PATCH /applications/track/:id (edits)
        API->>DB: validate, update, status -> pending, add note
        API-->>C: saved
    else not editable
        API-->>C: 403 (read-only)
    end
```

---

## 5) Application status (state machine)

`JobApplication.status` — any admin transition is allowed; only
`changes_requested` unlocks candidate edits, which return it to `pending`.

```mermaid
stateDiagram-v2
    [*] --> pending: submitted
    pending --> reviewed: admin
    pending --> changes_requested: admin asks for edits
    reviewed --> shortlisted: admin
    reviewed --> changes_requested: admin
    shortlisted --> accepted: hire
    shortlisted --> rejected: admin
    reviewed --> rejected: admin
    pending --> rejected: admin
    changes_requested --> pending: candidate re-submits
    accepted --> [*]
    rejected --> [*]

    note right of changes_requested
        Only state where the
        candidate can edit
    end note
```

---

## 6) Document & compliance status

Two document lifecycles feed the compliance status. On hire, **verified**
`ApplicationDocument`s are copied into `StaffDocument`s.

`ApplicationDocument.status`:

```mermaid
stateDiagram-v2
    [*] --> pending
    pending --> verified: verify
    pending --> rejected: reject
    verified --> expired: expiry passed
```

`StaffDocument.status` (created from a verified app doc on hire):

```mermaid
stateDiagram-v2
    [*] --> active: linked on hire
    active --> pending_renewal: nearing expiry
    active --> expired: expiry passed
    pending_renewal --> expired
```

Compliance status (`StaffComplianceRecord.status`) — authoritative, with a
read-time "past expiry then expired" override:

```mermaid
stateDiagram-v2
    [*] --> missing: no evidence
    missing --> pending: evidence received
    pending --> verified: admin verifies
    pending --> rejected: admin rejects
    verified --> expired: expiry passed
    rejected --> pending: new evidence
    expired --> pending: renewed
```

---

## 7) Compliance read path (fallback)

`buildComplianceView()` first decides **which** requirements a staff member is
measured against (targeting ∪ any they already have a record for), then resolves
each to a status card — falling back through legacy data during the migration
window. See [documents-compliance.md](./documents-compliance.md).

```mermaid
flowchart TD
    T["Requirements to show =<br/>targeted (role/position/global)<br/>∪ keys with an existing record (incl. manual)"] --> REC{"StaffComplianceRecord exists?"}
    REC -->|yes| RECOUT["status from record<br/>source = compliance_record"]
    REC -->|no| SD{"StaffDocument for this key?"}
    SD -->|yes| SDOUT["map status<br/>source = staff_document<br/>(fallback)"]
    SD -->|no| AD{"verified ApplicationDocument?<br/>(by email)"}
    AD -->|yes| ADOUT["map status<br/>source = application_document<br/>(fallback)"]
    AD -->|no| NONE["status = missing<br/>source = none"]

    RECOUT --> EXP{"expiryDate in the past?"}
    SDOUT --> EXP
    ADOUT --> EXP
    EXP -->|yes| MARK["override status = expired"]
    EXP -->|no| KEEP["keep status"]
    MARK --> CARD["Compliance card"]
    KEEP --> CARD
    NONE --> CARD
```

---

## 8) CRM sync & scheduling

Two schedulers; the orphan-delete safety guard is the important bit. See
[crm-sync.md](./crm-sync.md).

```mermaid
flowchart TB
    subgraph triggers["Triggers"]
        BOOT["server.js boot (+1.5s)"]
        TIMER["CronManager setTimeout loop"]
        NCRON["cron.js node-cron (02:00 / 08:00)"]
        MANUAL["Manual POST /api/sync/*"]
    end

    BOOT --> SYNCALL["POST /api/sync/all"]
    TIMER --> SYNCALL
    MANUAL --> SYNCALL

    SYNCALL --> LOOP["For each resource: page 50 at a time"]
    LOOP --> FETCH{"fetch page ok?"}
    FETCH -->|no| FLAG["fetchError = true, stop paging"]
    FETCH -->|yes| UPSERT["bulk upsert, collect activeIds"]
    UPSERT --> MORE{"more pages?"}
    MORE -->|yes| LOOP
    MORE -->|no| GUARD{"fetch clean AND activeIds not empty?"}
    FLAG --> GUARD
    GUARD -->|yes| PRUNE["deleteMany not-in activeIds"]
    GUARD -->|no| SKIP["skip prune (protect data)"]

    NCRON --> EXPIRE["checkDocumentExpiries()"]
    EXPIRE --> RULE{"days until expiry is 30 or 7?"}
    RULE -->|yes, not sent in 24h| SEND["POST /api/mail/document-expiry-reminder"]
    EXPIRE --> PAST{"days until expiry is 0 or less?"}
    PAST -->|yes| MARKEXP["StaffDocument.status = expired"]
```

---

## 9) Auth mechanisms

Three separate paths — pick by surface. See
[auth-and-access.md](./auth-and-access.md).

```mermaid
flowchart TB
    subgraph admin["1. Admin web (NextAuth)"]
        A1["email + password"] --> A2["bcrypt vs User"]
        A2 --> A3["JWT session, role on session.user"]
        A3 --> A4["admin routes: isAdmin() guard"]
    end
    subgraph cand["2. Candidate access"]
        B1["email"] --> B2["6-digit OTP (10m)"]
        B2 --> B3["access token, SHA-256 hash (30m)"]
        B3 --> B4["track/edit: verifyApplicationAccess()"]
    end
    subgraph mob["3. Mobile staff"]
        C1["email + password"] --> C2["bcrypt vs Staff"]
        C2 --> C3["email verified? (OTP)"]
        C3 --> C4["signed JWT (30d), Bearer"]
    end
```

Registration is Perfex-gated: a web admin account can only be created for a
`Staff` row with `admin === '1'`.

---

## 10) Compliance migration

Idempotent backfill (`npm run migrate:compliance`). See
[migrations/README.md](../migrations/README.md).

```mermaid
flowchart TD
    RUN["run.js"] --> S1["001 seed requirements"]
    S1 --> UP1["upsert ComplianceRequirement by key"]
    UP1 --> S2["002 backfill per active staff x requirement"]
    S2 --> DERIVE["derive status: StaffDocument -> ApplicationDocument"]
    DERIVE --> INS{"record inserted? ($setOnInsert)"}
    INS -->|new| WRITE["create record + evidence + events (record_created, migrated)"]
    INS -->|exists| SKIP["leave untouched (idempotent)"]
```

---

## 11) Unified document & compliance catalog

The `ComplianceRequirement` catalog is the **single source of truth** for every
document/credential. One requirement feeds both application intake and ongoing
compliance. General application content stays out of it.

```mermaid
flowchart TB
    CAT["ComplianceRequirement (catalog)<br/>label · evidenceMode · expiry · targeting<br/>collectAtApplication"]

    CAT -->|"collectAtApplication + (global or position match)"| FORM["Job application form<br/>required documents"]
    CAT -->|"role / position / manual targeting"| STAFFC["Ongoing staff compliance"]

    FORM -->|applicant submits| ADOC["ApplicationDocument<br/>documentType = requirement key"]
    ADOC -->|verified, on accept| SDOC["StaffDocument"]
    STAFFC --> REC["StaffComplianceRecord<br/>+ ComplianceEvidence + ComplianceEvent"]

    CF["ApplicationForm.customFields<br/>(name, experience, résumé upload…)"] -. stays independent .-> FORM
```

> Adding a requirement + ticking **collectAtApplication** makes it appear on the
> relevant application forms automatically — no separate document list to
> maintain. Non-compliance fields (including résumé file uploads) live in
> `customFields` and never touch the catalog.

---

## 12) Requirement targeting

Explicit / opt-in — a requirement applies to nobody unless targeted.

```mermaid
flowchart TD
    R["ComplianceRequirement"] --> C{"targeting"}
    C -->|appliesToAll = true| GLOBAL["Every staff member"]
    C -->|role listed| BYROLE["Staff whose role matches<br/>(role comes from Perfex)"]
    C -->|position listed| BYPOS["Staff whose positionId matches<br/>(stamped at accept)"]
    C -->|none of the above| NONE["Nobody<br/>(attach per staff instead)"]

    MAN["Manual attach<br/>StaffComplianceRecord.assignedManually = true"] --> ONE["That one staff member,<br/>regardless of targeting"]

    GLOBAL --> VIEW["Shown on staff compliance"]
    BYROLE --> VIEW
    BYPOS --> VIEW
    ONE --> VIEW
```

> At **application** time only *appliesToAll* and *position* targeting apply — the
> applicant has no role yet. Role targeting kicks in post-hire once Perfex sets
> the role. Built-in seeded requirements ship `appliesToAll: true`; new custom
> ones default to `false` (nobody until targeted or attached).

---

## 13) Editing a staff's compliance

The staff compliance detail modal → `POST /api/admin/compliance/staff/[staffId]/[requirementKey]`.
Every action upserts the record and appends an audit event.

```mermaid
flowchart LR
    subgraph actions["Admin action"]
        A1["Verify"]
        A2["Reject (reason)"]
        A3["Set expiry"]
        A4["Add evidence / Record receipt"]
        A5["Assign"]
        A6["Unassign"]
    end

    A1 --> E["Upsert StaffComplianceRecord<br/>(creates it if only a fallback existed)"]
    A2 --> E
    A3 --> E
    A4 --> E
    A5 --> E
    A6 --> DEL["Delete record (manual only)"]

    E --> S["status / expiry / verifiedBy updated"]
    A4 --> EV["ComplianceEvidence (file→Cloudinary, marked consumed)"]
    E --> EVT["ComplianceEvent appended (audit)"]
```

---

## 14) Accept-before-sync & reconciliation

Everything is filed under the Perfex `staffid`. If an application is accepted
**before** the person exists in Perfex, there is no id yet — data is filed under
email and self-heals on the next sync.

```mermaid
sequenceDiagram
    autonumber
    actor AD as Admin
    participant API
    participant DB as MongoDB
    participant SYNC as Perfex sync

    AD->>API: Accept application, person not in Perfex
    API->>DB: no staffid, so link docs keyed by EMAIL, position not stamped
    Note over DB: docs filed under the email (mis-keyed)

    SYNC->>DB: creates Staff 42 with staffid and role
    SYNC->>API: reconcileEmailKeyedCompliance()
    API->>DB: re-key email to 42 (docs + records), stamp position
    Note over DB: now filed under staffid 42, self-healed
```

> The good ordering — **sync first, then accept** — skips all of this: the staff
> row already exists, so docs link by `staffid` and position is stamped at
> accept. Role always comes from Perfex either way.
