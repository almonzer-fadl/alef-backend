/**
 * Health Module — Routes
 *
 * Replaces Bevel / Apple Health for daily health tracking.
 * One log per day covering weight, water, sleep basics, mood, and energy.
 *
 * Routes:
 *   GET  /health       — list recent logs (default 30 days)
 *   POST /health       — create or update today's log (upsert by date)
 *   GET  /health/:date — get a specific day's log
 */

import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { db } from "../db";
import { healthLogs } from "../db/schema";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth } from "../middleware/auth";
import type { AuthEnv } from "../middleware/auth";

export const healthRoutes = new Hono<AuthEnv>();

healthRoutes.use("*", requireAuth);

const healthLogSchema = z.object({
  date: z.string(),
  weight: z.number().optional(),
  waterMl: z.number().int().optional(),
  sleepHours: z.number().optional(),
  sleepQuality: z.number().int().min(1).max(5).optional(),
  bedtime: z.string().optional(),
  wakeTime: z.string().optional(),
  mood: z.enum(["great", "good", "okay", "bad", "terrible"]).optional(),
  energyLevel: z.number().int().min(1).max(5).optional(),
  notes: z.string().optional(),
});

// GET /health — list recent logs
healthRoutes.get("/", async (c) => {
  const userId = c.get("userId");
  const limit = parseInt(c.req.query("limit") || "30");

  const logs = await db
    .select()
    .from(healthLogs)
    .where(eq(healthLogs.userId, userId))
    .orderBy(desc(healthLogs.date))
    .limit(limit);

  return c.json({ logs });
});

// POST /health — create or update daily log (upsert by date)
healthRoutes.post("/", zValidator("json", healthLogSchema), async (c) => {
  const userId = c.get("userId");
  const data = c.req.valid("json");

  // Check if a log exists for this date already
  const [existing] = await db
    .select()
    .from(healthLogs)
    .where(and(eq(healthLogs.userId, userId), eq(healthLogs.date, data.date)))
    .limit(1);

  if (existing) {
    const [updated] = await db
      .update(healthLogs)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(healthLogs.id, existing.id))
      .returning();
    return c.json({ log: updated });
  }

  const [log] = await db
    .insert(healthLogs)
    .values({ userId, ...data })
    .returning();

  return c.json({ log }, 201);
});

// GET /health/:date — get a specific day's log
healthRoutes.get("/:date", async (c) => {
  const userId = c.get("userId");
  const date = c.req.param("date");

  const [log] = await db
    .select()
    .from(healthLogs)
    .where(and(eq(healthLogs.userId, userId), eq(healthLogs.date, date)))
    .limit(1);

  return c.json({ log: log || null });
});
