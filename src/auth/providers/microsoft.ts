import { createRemoteJWKSet, jwtVerify } from "jose";
import { env } from "../../config/env";

const JWKS = createRemoteJWKSet(
  new URL(`https://login.microsoftonline.com/${env.MICROSOFT_TENANT}/discovery/v2.0/keys`)
);

export async function verifyMicrosoftIdToken(idToken: string) {
  const { payload } = await jwtVerify(idToken, JWKS, {
    issuer: `https://login.microsoftonline.com/${env.MICROSOFT_TENANT}/v2.0`,
    audience: env.MICROSOFT_CLIENT_ID
  });

  return {
    sub: String(payload.sub),
    email: String(payload.preferred_username ?? payload.email),
    name: payload.name ? String(payload.name) : undefined
  };
}
