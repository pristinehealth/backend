import { createRemoteJWKSet, jwtVerify } from "jose";

const JWKS = createRemoteJWKSet(new URL("https://appleid.apple.com/auth/keys"));

export async function verifyAppleIdToken(idToken: string) {
  const { payload } = await jwtVerify(idToken, JWKS, {
    issuer: "https://appleid.apple.com"
  });

  return {
    sub: String(payload.sub),
    email: payload.email ? String(payload.email) : "",
    name: undefined
  };
}
