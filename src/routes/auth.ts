/**
 * Authentication Routes
 *
 * Handles user registration, login, and profile retrieval.
 * All passwords are hashed with bcrypt before storage.
 * Successful auth returns a JWT token for subsequent API calls.
 *
 * Routes:
 *   POST /auth/sign-up  — create new account
 *   POST /auth/sign-in  — login with email + password
 *   GET  /auth/me       — get current user profile (requires auth)
 *
 * The iOS app stores the token in @AppStorage("authToken")
 * and sends it as `Authorization: Bearer <token>` on every request.
 */

import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { db } from "../db";
import { users } from "../db/schema";
import { eq } from "drizzle-orm";
import { hashPassword, verifyPassword, createToken } from "../lib/auth";
import { requireAuth } from "../middleware/auth";
import type { AuthEnv } from "../middleware/auth";

export const authRoutes = new Hono<AuthEnv>();

// ─── Validation Schemas ──────────────────────────────────────────────

const signUpSchema = z.object({
  email: z.string().email("Valid email required"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  name: z.string().min(1, "Name is required"),
  timezone: z.string().optional(),
});

const signInSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

// ─── POST /auth/sign-up ──────────────────────────────────────────────

authRoutes.post("/sign-up", zValidator("json", signUpSchema), async (c) => {
  const { email, password, name, timezone } = c.req.valid("json");

  // Check for existing account with this email
  const existing = await db
    .select()
    .from(users)
    .where(eq(users.email, email.toLowerCase()))
    .limit(1);

  if (existing.length > 0) {
    return c.json({ error: "Email already registered" }, 409);
  }

  // Create account
  const passwordHash = await hashPassword(password);
  const [user] = await db
    .insert(users)
    .values({
      email: email.toLowerCase(),
      passwordHash,
      name,
      timezone: timezone || "UTC",
    })
    .returning();

  if (!user) {
    return c.json({ error: "Failed to create account" }, 500);
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
  }, 201);
});

// ─── POST /auth/sign-in ──────────────────────────────────────────────

authRoutes.post("/sign-in", zValidator("json", signInSchema), async (c) => {
  const { email, password } = c.req.valid("json");

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email.toLowerCase()))
    .limit(1);

  if (!user) {
    // Generic error to prevent email enumeration
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

// ─── GET /auth/me ────────────────────────────────────────────────────

/** Returns the authenticated user's profile. Used to validate tokens on app launch. */
authRoutes.get("/me", requireAuth, async (c) => {
  const userId = c.get("userId");

  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      timezone: users.timezone,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) {
    return c.json({ error: "User not found" }, 404);
  }

  return c.json({ user });
});
