import { Router } from "express";
import { z } from "zod";
import { env } from "../config/env";
import { createAccessToken } from "../auth/jwt";
import { verifyGoogleIdToken } from "../auth/providers/google";
import { verifyMicrosoftIdToken } from "../auth/providers/microsoft";
import { verifyAppleIdToken } from "../auth/providers/apple";
import {
  findPerfexStaffByEmail,
  verifyPerfexStaffPassword,
  type PerfexStaffUser,
} from "../auth/perfex";

const router = Router();

const ProviderSchema = z.object({
  provider: z.enum(["google", "microsoft", "apple"]),
  idToken: z.string().min(1),
});

const EmailLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

function assertProviderConfigured(provider: "google" | "microsoft" | "apple") {
  if (provider === "google") {
    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
      throw new Error("google_not_configured");
    }
  }

  if (provider === "microsoft") {
    if (!env.MICROSOFT_CLIENT_ID || !env.MICROSOFT_CLIENT_SECRET) {
      throw new Error("microsoft_not_configured");
    }
  }

  if (provider === "apple") {
    // Apple mobile flow verifies id_token via JWKS.
    // If you later add Apple code exchange, enforce APPLE_* here.
  }
}

function toSessionUserFromPerfex(user: PerfexStaffUser) {
  return {
    id: String(user.staffid),
    email: user.email,
    firstName: user.firstname ?? "",
    lastName: user.lastname ?? "",
    provider: "password" as const,
    role: "staff" as const,
  };
}

router.post("/auth/login", async (req, res) => {
  const parsed = EmailLoginSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ error: "invalid_request" });
    return;
  }

  const { email, password } = parsed.data;

  try {
    const staff = await findPerfexStaffByEmail(email);

    if (!staff) {
      res.status(401).json({ error: "invalid_credentials" });
      return;
    }

    const validPassword = await verifyPerfexStaffPassword(password, staff.password);

    if (!validPassword) {
      res.status(401).json({ error: "invalid_credentials" });
      return;
    }

    const user = toSessionUserFromPerfex(staff);

    req.session.user = user;

    const accessToken = await createAccessToken(user);

    res.json({
      ok: true,
      user,
      accessToken,
    });
  } catch (e) {
    console.error("POST /auth/login failed:", e);
  const msg = e instanceof Error ? e.message : "login_failed";
  res.status(500).json({ error: msg });
  }
});

router.post("/auth/oauth/mobile", async (req, res) => {
  const parsed = ProviderSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ error: "invalid_request" });
    return;
  }

  const { provider, idToken } = parsed.data;

  try {
    assertProviderConfigured(provider);

    const profile =
      provider === "google"
        ? await verifyGoogleIdToken(idToken)
        : provider === "microsoft"
          ? await verifyMicrosoftIdToken(idToken)
          : await verifyAppleIdToken(idToken);

    req.session.user = profile;

    const accessToken = await createAccessToken(profile);

    res.json({
      ok: true,
      user: profile,
      accessToken,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "oauth_failed";
    res.status(msg.endsWith("_not_configured") ? 500 : 401).json({ error: msg });
  }
});

router.post("/auth/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("sid");
    res.json({ ok: true });
  });
});

export default router;