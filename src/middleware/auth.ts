/**
 * Auth Middleware
 *
 * Protects routes that require authentication.
 * Extracts the JWT from the Authorization header (Bearer token),
 * verifies it, and sets `userId` on the Hono context.
 *
 * Usage:
 *   habitRoutes.use("*", requireAuth);  // protect all routes
 *   // or
 *   app.get("/secret", requireAuth, handler);  // protect single route
 *
 * The userId is then available via `c.get("userId")` in handlers.
 */

import type { Context, Next } from "hono";
import { verifyToken } from "../lib/auth";

/**
 * Hono context variables set by this middleware.
 * Import this type in route files to get typed `c.get("userId")`.
 */
export type AuthEnv = {
  Variables: {
    userId: string;
  };
};

export async function requireAuth(c: Context, next: Next) {
  const header = c.req.header("Authorization");

  if (!header?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized — no token provided" }, 401);
  }

  const token = header.slice(7); // strip "Bearer "
  const payload = verifyToken(token);

  if (!payload) {
    return c.json({ error: "Invalid or expired token" }, 401);
  }

  // Attach userId to context — available in all downstream handlers
  c.set("userId", payload.sub);
  await next();
}
