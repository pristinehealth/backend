import { SignJWT, jwtVerify } from "jose";
import { env } from "../config/env";
import type { SessionUser } from "./session";

const encoder = new TextEncoder();

export async function createAccessToken(user: SessionUser): Promise<string> {
  return new SignJWT(user)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(encoder.encode(env.JWT_SECRET));
}

export async function verifyAccessToken(token: string): Promise<SessionUser> {
  const { payload } = await jwtVerify(token, encoder.encode(env.JWT_SECRET));
  return payload as SessionUser;
}