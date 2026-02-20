import { Context, Next } from "hono";
import { verifyToken } from "../lib/auth";

export async function requireAuth(c: Context, next: Next) {
  const header = c.req.header("Authorization");
  if (!header?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const token = header.slice(7);
  const payload = verifyToken(token);
  if (!payload) {
    return c.json({ error: "Invalid or expired token" }, 401);
  }

  c.set("userId", payload.sub);
  await next();
}
