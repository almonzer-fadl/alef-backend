import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { authRoutes } from "./routes/auth";
import { habitRoutes } from "./routes/habits";
import { healthRoutes } from "./routes/health";
import { journalRoutes } from "./routes/journal";

const app = new Hono();

// Middleware
app.use("*", logger());
app.use("*", cors({
  origin: "*",
  allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization"],
}));

// Health check
app.get("/", (c) => c.json({
  name: "Alef API",
  version: "0.1.0",
  tagline: "A Life Entirely Filed",
}));

// Routes
app.route("/api/auth", authRoutes);
app.route("/api/habits", habitRoutes);
app.route("/api/health", healthRoutes);
app.route("/api/journal", journalRoutes);

// 404
app.notFound((c) => c.json({ error: "Not found" }, 404));

// Error handler
app.onError((err, c) => {
  console.error("Unhandled error:", err);
  return c.json({ error: "Internal server error" }, 500);
});

const port = parseInt(process.env.PORT || "3002");

console.log(`\n🔤 Alef API running on http://localhost:${port}\n`);

export default {
  port,
  fetch: app.fetch,
};
