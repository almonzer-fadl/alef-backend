import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { db } from "../db";
import { healthLogs } from "../db/schema";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth } from "../middleware/auth";

export const healthRoutes = new Hono();

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

// GET /health — list logs
healthRoutes.get("/", async (c) => {
  const userId = c.get("userId");
  const limit = parseInt(c.req.query("limit") || "30");

  const logs = await db.select().from(healthLogs)
    .where(eq(healthLogs.userId, userId))
    .orderBy(desc(healthLogs.date))
    .limit(limit);

  return c.json({ logs });
});

// POST /health — create or update daily log
healthRoutes.post("/", zValidator("json", healthLogSchema), async (c) => {
  const userId = c.get("userId");
  const data = c.req.valid("json");

  // Upsert by date
  const existing = await db.select().from(healthLogs)
    .where(and(eq(healthLogs.userId, userId), eq(healthLogs.date, data.date)))
    .limit(1);

  if (existing.length > 0) {
    const [updated] = await db.update(healthLogs)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(healthLogs.id, existing[0].id))
      .returning();
    return c.json({ log: updated });
  }

  const [log] = await db.insert(healthLogs).values({
    userId,
    ...data,
  }).returning();

  return c.json({ log }, 201);
});

// GET /health/:date — get specific day
healthRoutes.get("/:date", async (c) => {
  const userId = c.get("userId");
  const date = c.req.param("date");

  const [log] = await db.select().from(healthLogs)
    .where(and(eq(healthLogs.userId, userId), eq(healthLogs.date, date)))
    .limit(1);

  return c.json({ log: log || null });
});
