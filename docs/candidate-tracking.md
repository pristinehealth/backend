# Candidate Tracking

How an applicant checks and edits their application **without an account**, using
an OTP-verified, short-lived access token.

```
POST /access/request   email ─────────────▶ 6-digit OTP emailed (10-min TTL)
POST /access/verify    email + code ──────▶ accessToken (30-min TTL, hash stored)
POST /check            email + token ─────▶ list my applications
GET  /track/[id]       email + token ─────▶ one application + form + docs + canEdit
PATCH/DELETE /track/[id]                   ─▶ edit (if changes_requested) / delete
```

Pages: `/jobs/track`, `/jobs/track/[id]`.

---

## 1) Request an access code

**`POST /api/applications/access/request`** — body `{ email }`.
1. Normalize email; 404 if no `JobApplication` exists for it (case-insensitive).
2. Generate a **6-digit OTP** (`crypto.randomInt`), TTL **10 minutes**.
3. Upsert `ApplicationAccessSession` (store OTP; clear any prior token).
4. Email the code via `sendApplicationTrackingOtpEmail`.

Returns a generic success message (no account enumeration beyond the 404).

## 2) Verify → receive token

**`POST /api/applications/access/verify`** — body `{ email, code }`.
1. Load the session; 401 if OTP missing/expired or code mismatch.
2. Mint an access token `${uuid}-${uuid}`.
3. Store **only its SHA-256 hash** + `accessTokenExpiry = now + 30 min`; clear OTP.
4. Return `{ accessToken, expiresAt }` (plaintext token to the client only).

Token verification for every subsequent call goes through
`verifyApplicationAccess(email, token)` (`src/lib/applicationAccess.ts`): re-hash,
match session, require `accessTokenExpiry >= now`.

---

## 3) List applications

**`POST /api/applications/check`** — body `{ email, accessToken }` (🟡 token).
Verifies access, then returns the caller's applications enriched with job title +
status.

## 4) Track one application

**`GET /api/applications/track/[id]?email=&accessToken=`** (🟡 token).
Returns `{ application, job, form, documents, canEdit }`. `documents` are sorted
newest-first. **`canEdit` is true only when `application.status === 'changes_requested'`.**

## 5) Edit (only when changes requested)

**`PATCH /api/applications/track/[id]`** — body includes `email`, `accessToken`,
`applicantName`, `customFieldValues`, `documents[]`, `uploadedPublicIds[]`.
1. Verify token; 404 if not found; **403 unless status is `changes_requested`.**
2. Re-run the same custom-field and document validation as submission.
3. Update the application, set `status` back to **`pending`**, and append the note
   *"Application updated by candidate after admin review request."*
4. Reconcile documents: delete types no longer submitted; for unchanged docs that
   were already `verified`, **preserve the verification**; otherwise reset to
   `pending`.
5. Mark consumed `UploadAsset`s and link them to the application.

## 6) Delete

**`DELETE /api/applications/track/[id]?email=&accessToken=`** (🟡 token).
Verifies token, deletes the application, its `ApplicationDocument`s, and its
`UploadAsset`s — **including removing the files from Cloudinary.**

---

## Security notes

- Access is **email + OTP only** — no passwords, no long-lived sessions.
- The access token is never stored in plaintext (SHA-256 hash only).
- TTLs: OTP **10 min**, access token **30 min**; expiry is re-checked on every call.
- Editing is strictly limited to the `changes_requested` state; a successful edit
  returns the application to `pending` for re-review.
- In dev (no `RESEND_API_KEY`), OTP/emails are logged to stdout instead of sent.
