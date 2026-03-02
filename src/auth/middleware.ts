import type { NextFunction, Request, Response } from "express";
import { verifyAccessToken } from "./jwt";

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    if (req.session?.user) {
      req.user = req.session.user;
      next();
      return;
    }

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }

    const token = authHeader.slice("Bearer ".length).trim();
    const user = await verifyAccessToken(token);

    req.user = user;
    next();
  } catch {
    res.status(401).json({ error: "unauthorized" });
  }
}