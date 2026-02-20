import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { db } from "../db";
import { users } from "../db/schema";
import { eq } from "drizzle-orm";
import { hashPassword, verifyPassword, createToken } from "../lib/auth";
import { requireAuth } from "../middleware/auth";

export const authRoutes = new Hono();

const signUpSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().min(1),
  timezone: z.string().optional(),
});

const signInSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

// POST /auth/sign-up
authRoutes.post("/sign-up", zValidator("json", signUpSchema), async (c) => {
  const { email, password, name, timezone } = c.req.valid("json");

  // Check if user exists
  const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (existing.length > 0) {
    return c.json({ error: "Email already registered" }, 409);
  }

  const passwordHash = await hashPassword(password);
  const [user] = await db.insert(users).values({
    email,
    passwordHash,
    name,
    timezone: timezone || "UTC",
  }).returning();

  const token = createToken(user.id);

  return c.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      timezone: user.timezone,
    },
  }, 201);
});

// POST /auth/sign-in
authRoutes.post("/sign-in", zValidator("json", signInSchema), async (c) => {
  const { email, password } = c.req.valid("json");

  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user) {
    return c.json({ error: "Invalid email or password" }, 401);
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    return c.json({ error: "Invalid email or password" }, 401);
  }

  const token = createToken(user.id);

  return c.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      timezone: user.timezone,
    },
  });
});

// GET /auth/me
authRoutes.get("/me", requireAuth, async (c) => {
  const userId = c.get("userId");
  const [user] = await db.select({
    id: users.id,
    email: users.email,
    name: users.name,
    timezone: users.timezone,
    createdAt: users.createdAt,
  }).from(users).where(eq(users.id, userId)).limit(1);

  if (!user) {
    return c.json({ error: "User not found" }, 404);
  }

  return c.json({ user });
});
