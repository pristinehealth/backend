# Auth & Access Control

Three independent auth mechanisms coexist. Pick the right one per surface.

| # | Mechanism | Who | Credential | Session/Token | TTL |
|---|---|---|---|---|---|
| 1 | Admin web (NextAuth) | Perfex admins (`Staff.admin==='1'`) | email + password (bcrypt) | NextAuth JWT | NextAuth default |
| 2 | Candidate access | Job applicants (no account) | email + OTP → access token | SHA-256 token in DB | OTP 10m / token 30m |
| 3 | Mobile staff | Any Perfex staff | email + password + email OTP | signed JWT (jsonwebtoken) | 30 days |

---

## 1) Admin web — NextAuth Credentials

**File:** `src/app/api/auth/[...nextauth]/route.ts`

- Credentials provider `authorize()`:
  1. Load `User` by email (with `+password`).
  2. `bcrypt.compare` the submitted password; throw `Invalid credentials` on miss.
  3. Return `{ id, email, name, role }`.
- `jwt` callback copies `role`/`id` onto the token; `session` callback copies
  them onto `session.user`. Strategy is `jwt`. Sign-in page `/login`, secret
  `NEXTAUTH_SECRET`.

**Gating admin endpoints** — the standard inline check:
```ts
const session = await getServerSession(authOptions);
if (!session?.user?.role || !['admin', 'superadmin'].includes(session.user.role)) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}
```

**Registration is Perfex-gated** — `src/app/api/auth/register/route.ts`:
1. Look up `Staff` by email; 403 if not a Perfex staff member.
2. 403 unless `staff.admin === '1'` (only Perfex admins can register).
3. 400 if a `User` already exists; else bcrypt-hash (10 rounds) and create `User`.

> **Role source of truth:** the *right to become an admin* comes from Perfex
> (`Staff.admin === '1'`). Once a `User` exists, its own `role`
> (`admin`/`superadmin`, default `admin`) drives endpoint authorization.

> **Type note:** `session.user.role`/`id` aren't on the default next-auth
> `Session` type. `src/types/next-auth.d.ts` augments `Session`/`User`/`JWT` with
> them, so admin routes reading `session.user.role` type-check cleanly.

---

## 2) Candidate access — OTP + hashed token

No account. Covered in depth in [candidate-tracking.md](./candidate-tracking.md).
Summary:
- `POST /api/applications/access/request` → 6-digit OTP (10-min TTL) emailed.
- `POST /api/applications/access/verify` → returns an access token
  (`${uuid}-${uuid}`), stored **SHA-256-hashed** with a 30-min TTL.
- Every tracking call passes `email` + `accessToken`, validated by
  `verifyApplicationAccess()` (`src/lib/applicationAccess.ts`): re-hashes the
  token, matches the session, checks `accessTokenExpiry >= now`.

---

## 3) Mobile staff — JWT + email OTP

Backed entirely by the `Staff` model's auth fields. JWT secret is `JWT_SECRET`
(falls back to a dev default — **set this in production**). All JWTs are
`sign({ userid, email, role, admin }, JWT_SECRET, { expiresIn: '30d' })`.

| Endpoint | Purpose | Notes |
|---|---|---|
| `POST /api/mobile/auth/signup` | Create app login for existing staff | Requires a `Staff` row, no existing `passwordHash`; bcrypt(10); sets `emailVerified=false` + 6-digit OTP (10m); emails OTP |
| `POST /api/mobile/auth/verify-email` | Confirm signup | Validates OTP; sets `emailVerified=true`; issues 30-day JWT |
| `POST /api/mobile/auth/login` | Password login | Requires `emailVerified===true` (else 403 `EMAIL_NOT_VERIFIED`); bcrypt compare; issues JWT |
| `POST /api/mobile/auth/request-otp` | Send OTP (reset/verify) | Neutral response for privacy; `reset` requires `isBackendRegistered` |
| `POST /api/mobile/auth/verify-otp` | Validate OTP → JWT | Used for reset flows |
| `POST /api/mobile/auth/reset-password` | Set new password via OTP | bcrypt(10); sets `emailVerified=true`; clears OTP |
| `GET/DELETE /api/mobile/profile` | Read/delete own profile | `Authorization: Bearer <JWT>`; strips `otpCode`/`otpExpiry`; DELETE clears `passwordHash`/`emailVerified`/`isBackendRegistered` |

OTP details: 6 digits via `crypto.randomInt(100000, 999999)`, 10-minute TTL,
compared after stripping non-digits.

> Protected mobile routes verify **token validity + `userid` existence**
> (`isBackendRegistered===true` for profile); they don't yet enforce
> per-role ACLs even though `role`/`admin` ride in the JWT.

---

## Quick reference — which check guards what

- ⚪ **Public**: careers listing/detail/apply, candidate access request/verify.
- 🟡 **Candidate token**: `/api/applications/check`, `/api/applications/track/[id]`.
- 🔴 **Admin/superadmin**: `/api/admin/**`, staff document writes, sync triggers.
- 🟢 **Mobile JWT**: `/api/mobile/**` (Bearer token).
- **Mixed**: `/api/applications/[id]/documents` accepts the application's own
  applicant (email match) **or** an admin.
