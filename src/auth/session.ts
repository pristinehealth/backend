import session from "express-session";
import type { SessionOptions } from "express-session";
import { env } from "../config/env";

export type SessionUser = {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  provider: "password" | "google" | "microsoft" | "apple";
  role?: string;
};

export const sessionMiddleware = session({
  name: "sid",
  secret: env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: env.NODE_ENV === "production" ? "none" : "lax",
    maxAge: 1000 * 60 * 60 * 24 * 7,
  },
} as SessionOptions);

declare module "express-session" {
  interface SessionData {
    user?: SessionUser;
  }
}

declare global {
  namespace Express {
    interface Request {
      user?: SessionUser;
    }
  }
}