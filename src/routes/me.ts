import { Router } from "express";
import { requireAuth } from "../auth/middleware";

const router = Router();

router.get("/me", requireAuth, (req, res) => {
  res.json({ user: req.user ?? req.session.user });
});

export default router;