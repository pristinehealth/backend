# SEO Progress Tracker

Living checklist for the SEO effort on the Next.js app (**pristinehealthstaffing.com** — not the Perfex CRM). Strategy reference: [`seo-plan.html`](./seo-plan.html).

**Architecture:** two buyer-facing acquisition systems under one brand — **Facility Staffing** (nursing homes, assisted living, memory care, SNF, hospitals → admins/DONs/coordinators) and **Home Care** (families). Pages are **data-driven** (service × customer × geography); adding a page = one entry in [`src/lib/marketing/taxonomy.ts`](./src/lib/marketing/taxonomy.ts).

Status key: ✅ done · 🚧 in progress · ⬜ not started

_Last updated: 2026-09-09 (Phases 1–4 done)_

---

## Phase 1 — Foundation + marketing architecture  ✅ (PR #44)

| Item | Status | Where |
|---|---|---|
| SEO config + JSON-LD builders (Org, WebSite, Service, LocalBusiness, Breadcrumb, FAQ, JobPosting) | ✅ | `src/lib/seo.ts` |
| Server-rendered JSON-LD component | ✅ | `src/components/JsonLd.tsx` |
| Root metadata (metadataBase, title template, OG, Twitter, robots) + Org/WebSite | ✅ | `src/app/layout.tsx` |
| `robots.txt` + `sitemap.xml` (taxonomy + open jobs from Mongo) | ✅ | `src/app/robots.ts`, `src/app/sitemap.ts` |
| Middleware allowlist for marketing routes + robots/sitemap | ✅ | `src/proxy.ts` |
| `/facility-staffing` hub + 11 service pages (SSG) | ✅ | `src/app/(marketing)/facility-staffing/` |
| `/home-care` hub + 8 service pages (SSG) | ✅ | `src/app/(marketing)/home-care/` |
| `/locations` hub + 9 WA city hubs (SSG) | ✅ | `src/app/(marketing)/locations/` |
| Per-page Service/LocalBusiness + Breadcrumb + FAQ schema | ✅ | page templates in `src/components/marketing/` |
| Content taxonomy (editable placeholder copy) | ✅ | `src/lib/marketing/taxonomy.ts` |

Verified: `tsc --noEmit` clean, `next build` green (all marketing routes prerendered SSG).

---

## Phase 2 — Buyer intake forms  ✅

Turn the two audiences into leads. Reuses the existing `/api/contact` pipeline (rate limit + honeypot + time-trap + link-flood + reCAPTCHA v3 + `sendContactEmail`); no new API or model.

- ✅ `/request-staffing` — facility intake (facility name/type, roles, city, shifts, urgency, notes)
- ✅ `/request-home-care` — family intake (recipient, care type, city, hours, start, notes)
- ✅ Reuse `/api/contact` (structured fields composed into the message; `inquiryType` set per form)
- ✅ Swap `STAFFING_CTA` / `HOMECARE_CTA` to the new routes + middleware allowlist + sitemap
- ✅ Thank-you / confirmation state (inline success panel)
- ✅ Reusable `IntakeForm` client component (declarative field schema; loads reCAPTCHA)

## Phase 3 — Route homepage CTAs to the intake pages  ✅ (rewire-only)

Scope chosen: **rewire only** — no hero redesign; the old `#contact` form stays. In `src/app/page.tsx`, the homepage's buttons used to scroll to the on-page `#contact` form and pre-select an inquiry dropdown; they now navigate to the dedicated pages:

- ✅ Hero "Request Staffing" + Workforce "Find Staffing Solutions" + final-band "Request Staffing" → `/request-staffing`
- ✅ In-Home "Explore Care Options" + final-band "Get In-Home Care" → `/request-home-care`
- ✅ Hero "Explore In-Home Care" → `/home-care` hub
- ✅ Removed the now-unused `requestType` helper
- ⬜ *Not done (deferred):* redesign the hero into two side-by-side Facilities/Families panels — a bigger visual change, skipped by choice.

Left as-is on purpose: nav "Portal Login" button, nav "Contact" link, the Technology-section generic "get in touch" button, and the `#contact` inline form itself (still a second, general-purpose lead path).

## Phase 4 — Google for Jobs (`JobPosting`)  ✅

`/jobs/[id]` was a `"use client"` page fetching `/api/jobs/[id]` in `useEffect` — the job content and schema never reached the initial HTML, so Google couldn't read them.

- ✅ `page.tsx` is now a **server component**: reads the job from Mongo via a `cache()`-wrapped `getJob` (one DB read shared by `generateMetadata` + the page), `notFound()` on missing / non-`open` / invalid ObjectId.
- ✅ Emits `JobPosting` + `BreadcrumbList` JSON-LD in server HTML via `jobPostingLd` (`src/lib/seo.ts`). Fields mapped from the model: `title`, `sections`→`description` (HTML), `createdAt`→`datePosted`, `city`+`location`→`jobLocation`, `imageUrl`→`image`.
- ✅ Per-job metadata: title `"<title> — <city, ST>"`, description built from sections (≤160 chars), canonical, Open Graph.
- ✅ Existing UI + interactivity (theme toggle, Apply buttons) moved to `JobDetailClient.tsx`, which takes the job as a prop.
- ✂️ *Not doing `validThrough`* — decided we don't need it (owner, 2026-09-09). Consequence accepted: Google may expire a listing ~30 days after `datePosted`; re-posting/updating the role refreshes it. `employmentType`/`baseSalary` similarly skipped unless we later capture them on the `JobPosition` model.

**To verify after deploy:** paste a live `/jobs/<id>` URL into Google's [Rich Results Test](https://search.google.com/test/rich-results) — expect a valid "Job posting".

## Phase 5 — Resources / content hub  ⬜ (blocked on content)

**Purpose:** capture *informational* searches the transactional service pages can't rank for (e.g. "how much does in-home care cost", "signs my parent needs home care", "per diem vs contract staffing"), then internal-link those readers down to the request/service pages, and build topical authority that lifts the money pages. It's an empty container until real articles exist.

- ⬜ `/resources` index + article template (schema: Article/FAQ)
- ⬜ Seed cornerstone posts from strategy keywords
- ❓ **Decision needed:** only worth building if someone will write ~5–10 articles. If not, skip in favor of Phase 6.

## Phase 6 — Off-code (owner tasks, not in repo)  ⬜

- ⬜ Google Business Profile (claim + optimize)
- ⬜ Reviews flow
- ⬜ Google Ads negative-keyword list
- ⬜ Set `NEXT_PUBLIC_BASE_URL` in production env

---

## Decisions

- **Base URL:** `NEXT_PUBLIC_BASE_URL`, defaults to `https://pristinehealthstaffing.com`.
- **Taxonomy in code** (not CMS/DB) — fastest, fully static, version-controlled. Revisit if non-devs need to edit copy.
- **`taxonomy.ts` copy approved** by the owner (2026-09-09), with one correction applied: **scope is nationwide, not Washington.**
- **Nationwide, WA-first (2026-09-09).** Brand copy + schema now say the company serves clients across the U.S.; Washington is the launch market, not a limit. Concretely: `areaServed` in Organization/Service schema = `Country: United States` (was `State: Washington`); ContactPoint `areaServed` = `US`; `jobPostingLd`/`localBusinessLd` no longer default a missing region to `WA`; body copy says "nationwide" / "across the U.S."; `SITE_AREA`/`SITE_COUNTRY` replaced `SITE_STATE`; the Service Areas page states any location is served (WA cities listed as "where we're active now" + an "ask about your area" CTA). The 9 WA city pages remain as the initial local-SEO set; more cities/states are pure data entry in `taxonomy.ts`.
- `AggregateRating` schema deferred until real reviews exist.

## Open questions for the owner

- [x] ~~Edit/approve the copy in `taxonomy.ts`~~ — approved as-is (2026-09-09).
- [ ] Confirm the 9 launch cities are the right ones.
- [ ] Route staffing vs home-care leads to different inboxes? (Both currently email the same address via `/api/contact` → `sendContactEmail`.)
