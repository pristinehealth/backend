import { createRemoteJWKSet, jwtVerify } from "jose";
import { env } from "../../config/env";

const JWKS = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));

export async function verifyGoogleIdToken(idToken: string) {
  const { payload } = await jwtVerify(idToken, JWKS, {
    issuer: "https://accounts.google.com",
    audience: env.GOOGLE_CLIENT_ID
  });

  return {
    sub: String(payload.sub),
    email: String(payload.email),
    name: payload.name ? String(payload.name) : undefined,
    picture: payload.picture ? String(payload.picture) : undefined
  };
}
