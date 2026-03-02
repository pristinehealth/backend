import express from "express";
import cors from "cors";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import { env } from "./config/env";
import { sessionMiddleware } from "./auth/session";
import authRoutes from "./routes/auth";
import meRoutes from "./routes/me";

const app = express();

app.use(morgan("dev"));
app.use(express.json());
app.use(cookieParser());

app.use(
  cors({
    origin: env.CORS_ORIGIN,
    credentials: true,
  })
);

app.use(sessionMiddleware);

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.use(authRoutes);
app.use(meRoutes);

app.listen(env.PORT, () => {
  console.log(`API listening at ${env.PUBLIC_BASE_URL}`);
});