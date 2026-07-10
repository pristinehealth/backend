# Backend Documentation

System documentation for the Pristine backend (careers, staff, compliance, and
CRM sync). Start with the overview, then drill into a domain.

## Index

| Doc | What it covers |
|---|---|
| [system-overview.md](./system-overview.md) | Stack, domains, entry points, high-level data flow — **read this first** |
| [diagrams.md](./diagrams.md) | Mermaid diagrams: architecture, ER, sequences, state machines, sync — **the visual map** |
| [data-models.md](./data-models.md) | Every Mongoose model, its fields, indexes, and relationships |
| [auth-and-access.md](./auth-and-access.md) | The three auth mechanisms: admin (NextAuth), candidate OTP, mobile staff |
| [hiring-flow.md](./hiring-flow.md) | Careers: jobs, forms, application submission, admin review, hire → staff |
| [candidate-tracking.md](./candidate-tracking.md) | Applicant self-service: OTP access, tracking, and editing an application |
| [documents-compliance.md](./documents-compliance.md) | Document types & storage rules, staff documents, and the compliance domain |
| [retention.md](./retention.md) | Data retention & secure disposal — archive on termination, retention clock, disposal sweep |
| [crm-sync.md](./crm-sync.md) | Perfex CRM sync, scheduling, and document-expiry reminders |
| [api-reference.md](./api-reference.md) | Endpoint catalog grouped by area |
| [handover-compliance.md](./handover-compliance.md) | Compliance work plan & handover baseline |

## Conventions used in these docs

- **File pointers** use `path:line` form so they're easy to open.
- **Auth badges**: 🔴 admin/superadmin · 🟡 candidate token · 🟢 mobile staff · ⚪ public.
- Code is Next.js App Router: endpoints are `src/app/api/**/route.ts`, pages are
  `src/app/**/page.tsx`, models are `src/models/*.ts`, shared logic is `src/lib/*`.

## Keeping docs current

These describe behavior as of the compliance-domain work (see
`handover-compliance.md`). When you change an endpoint's contract, a model's
shape, or a background job's rules, update the matching domain doc and the
`data-models.md` / `api-reference.md` tables.
