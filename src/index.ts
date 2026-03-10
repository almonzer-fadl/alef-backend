/**
 * Alef API — أ — Entry Point
 *
 * A Life Entirely Filed.
 * Self-hosted, privacy-first life operating system.
 *
 * Stack: Bun + Hono + Drizzle + PostgreSQL
 * License: MIT (open source)
 *
 * API Structure:
 *   /api/auth/*     — signup, login, token refresh, profile
 *   /api/modules/*  — enable/disable life-tracking modules
 *   /api/habits/*   — habit tracking (streaks, timer, heatmap)
 *   /api/health/*   — vitals, weight, water, mood
 *   /api/journal/*  — daily entries, mood tags, reflections
 *
 * Each module route is guarded by auth middleware.
 * Module-specific routes will eventually check if the module
 * is enabled for the user (module guard — TODO).
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { authRoutes } from "./routes/auth";
import { moduleRoutes } from "./routes/modules";
import { habitRoutes } from "./routes/habits";
import { healthRoutes } from "./routes/health";
import { journalRoutes } from "./routes/journal";
import { dietRoutes } from "./routes/diet";
import { fitnessRoutes } from "./routes/fitness";
import { mediaRoutes } from "./routes/media";
import { bookRoutes } from "./routes/books";

const app = new Hono();

// ─── Middleware ───────────────────────────────────────────────────────

// Request logging — shows method, path, status, and duration
app.use("*", logger());

// CORS — allow all origins during development.
// In production, this should be locked down to the app's domain.
app.use("*", cors({
  origin: "*",
  allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization"],
}));

// ─── Health Check ────────────────────────────────────────────────────

/** Root endpoint — confirms the API is running. Used by Docker health checks. */
app.get("/", (c) => c.json({
  name: "Alef API",
  version: "0.1.0",
  tagline: "A Life Entirely Filed",
}));

// ─── Routes ──────────────────────────────────────────────────────────

app.route("/api/auth", authRoutes);
app.route("/api/modules", moduleRoutes);
app.route("/api/habits", habitRoutes);
app.route("/api/health", healthRoutes);
app.route("/api/journal", journalRoutes);
app.route("/api/diet", dietRoutes);
app.route("/api/fitness", fitnessRoutes);
app.route("/api/media", mediaRoutes);
app.route("/api/books", bookRoutes);

// ─── Error Handling ──────────────────────────────────────────────────

/** 404 — no matching route found */
app.notFound((c) => c.json({ error: "Not found" }, 404));

/** Global error handler — catches unhandled exceptions */
app.onError((err, c) => {
  console.error("Unhandled error:", err);
  return c.json({ error: "Internal server error" }, 500);
});

// ─── Start Server ────────────────────────────────────────────────────

const port = parseInt(process.env.PORT || "3002");

console.log(`\n🔤 Alef API running on http://localhost:${port}\n`);

export default {
  port,
  fetch: app.fetch,
};
