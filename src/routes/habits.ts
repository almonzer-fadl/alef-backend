import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { db } from "../db";
import { habits, habitLogs } from "../db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { requireAuth } from "../middleware/auth";

export const habitRoutes = new Hono();

// All routes require auth
habitRoutes.use("*", requireAuth);

const createHabitSchema = z.object({
  name: z.string().min(1),
  emoji: z.string().optional(),
  color: z.string().optional(),
  frequency: z.enum(["daily", "weekly", "monthly", "custom"]).optional(),
  targetPerDay: z.number().int().min(1).optional(),
  reminderTime: z.string().optional(),
});

const updateHabitSchema = createHabitSchema.partial().extend({
  isArchived: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

const logHabitSchema = z.object({
  date: z.string(), // YYYY-MM-DD
  count: z.number().int().min(0).optional(),
  note: z.string().optional(),
});

// GET /habits — list all habits
habitRoutes.get("/", async (c) => {
  const userId = c.get("userId");
  const includeArchived = c.req.query("archived") === "true";

  let query = db.select().from(habits)
    .where(eq(habits.userId, userId))
    .orderBy(habits.sortOrder);

  const result = await query;
  const filtered = includeArchived ? result : result.filter(h => !h.isArchived);

  return c.json({ habits: filtered });
});

// POST /habits — create habit
habitRoutes.post("/", zValidator("json", createHabitSchema), async (c) => {
  const userId = c.get("userId");
  const data = c.req.valid("json");

  const [habit] = await db.insert(habits).values({
    userId,
    ...data,
  }).returning();

  return c.json({ habit }, 201);
});

// PATCH /habits/:id — update habit
habitRoutes.patch("/:id", zValidator("json", updateHabitSchema), async (c) => {
  const userId = c.get("userId");
  const habitId = c.req.param("id");
  const data = c.req.valid("json");

  const [habit] = await db.update(habits)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(habits.id, habitId), eq(habits.userId, userId)))
    .returning();

  if (!habit) return c.json({ error: "Habit not found" }, 404);
  return c.json({ habit });
});

// DELETE /habits/:id
habitRoutes.delete("/:id", async (c) => {
  const userId = c.get("userId");
  const habitId = c.req.param("id");

  const [deleted] = await db.delete(habits)
    .where(and(eq(habits.id, habitId), eq(habits.userId, userId)))
    .returning();

  if (!deleted) return c.json({ error: "Habit not found" }, 404);
  return c.json({ message: "Habit deleted" });
});

// POST /habits/:id/log — log a habit completion
habitRoutes.post("/:id/log", zValidator("json", logHabitSchema), async (c) => {
  const userId = c.get("userId");
  const habitId = c.req.param("id");
  const { date, count, note } = c.req.valid("json");

  // Verify habit belongs to user
  const [habit] = await db.select().from(habits)
    .where(and(eq(habits.id, habitId), eq(habits.userId, userId)))
    .limit(1);

  if (!habit) return c.json({ error: "Habit not found" }, 404);

  // Upsert: if log exists for this date, update count
  const existing = await db.select().from(habitLogs)
    .where(and(eq(habitLogs.habitId, habitId), eq(habitLogs.date, date)))
    .limit(1);

  if (existing.length > 0) {
    const [updated] = await db.update(habitLogs)
      .set({ count: count ?? (existing[0].count + 1), note })
      .where(eq(habitLogs.id, existing[0].id))
      .returning();
    return c.json({ log: updated });
  }

  const [log] = await db.insert(habitLogs).values({
    habitId,
    userId,
    date,
    count: count ?? 1,
    note,
  }).returning();

  return c.json({ log }, 201);
});

// GET /habits/:id/logs — get logs for a habit
habitRoutes.get("/:id/logs", async (c) => {
  const userId = c.get("userId");
  const habitId = c.req.param("id");
  const from = c.req.query("from"); // YYYY-MM-DD
  const to = c.req.query("to");     // YYYY-MM-DD

  let conditions = [
    eq(habitLogs.habitId, habitId),
    eq(habitLogs.userId, userId),
  ];

  // Date filtering via raw SQL for simplicity
  const logs = await db.select().from(habitLogs)
    .where(and(...conditions))
    .orderBy(desc(habitLogs.date));

  return c.json({ logs });
});

// GET /habits/today — get today's status for all habits
habitRoutes.get("/today", async (c) => {
  const userId = c.get("userId");
  const today = new Date().toISOString().split("T")[0];

  const userHabits = await db.select().from(habits)
    .where(and(eq(habits.userId, userId), eq(habits.isArchived, false)))
    .orderBy(habits.sortOrder);

  const todayLogs = await db.select().from(habitLogs)
    .where(and(eq(habitLogs.userId, userId), eq(habitLogs.date, today)));

  const logMap = new Map(todayLogs.map(l => [l.habitId, l]));

  const result = userHabits.map(h => ({
    ...h,
    todayLog: logMap.get(h.id) || null,
    completed: (logMap.get(h.id)?.count ?? 0) >= (h.targetPerDay ?? 1),
  }));

  return c.json({ habits: result, date: today });
});
