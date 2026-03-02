/**
 * Habits Module — Routes
 *
 * The core module of Alef. Replaces Grit (HabitTracker).
 * Supports three goal types:
 *   - boolean: simple did/didn't (tap to complete)
 *   - numeric: track a value (e.g., 2500ml water, 20 pages)
 *   - timer: duration-based (e.g., 10 min meditation)
 *
 * Routes:
 *   GET    /habits         — list all habits (excludes archived by default)
 *   GET    /habits/today   — today's habits with completion status
 *   POST   /habits         — create a new habit
 *   PATCH  /habits/:id     — update a habit
 *   DELETE /habits/:id     — delete a habit permanently
 *   POST   /habits/:id/log — log a completion entry for a date
 *   GET    /habits/:id/logs — get log history (for heatmap/calendar)
 *
 * Streak calculation is done client-side from the log data.
 * This keeps the API simple and avoids timezone complications.
 */

import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { db } from "../db";
import { habits, habitEntries } from "../db/schema";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth } from "../middleware/auth";
import type { AuthEnv } from "../middleware/auth";

export const habitRoutes = new Hono<AuthEnv>();

// All habit routes require authentication
habitRoutes.use("*", requireAuth);

// ─── Validation Schemas ──────────────────────────────────────────────

const createHabitSchema = z.object({
  name: z.string().min(1, "Habit name is required"),
  icon: z.string().optional(),                // SF Symbol name or emoji
  color: z.string().optional(),               // hex colour for the habit card
  goalType: z.enum(["boolean", "numeric", "timer"]).optional(),
  goalValue: z.number().int().min(1).optional(),
  goalUnit: z.string().optional(),            // "ml", "pages", "minutes", etc.
  frequency: z.enum(["daily", "weekly", "monthly", "custom"]).optional(),
  reminderTime: z.string().optional(),        // "08:00" local time
  groupName: z.string().optional(),           // for habit grouping
});

const updateHabitSchema = createHabitSchema.partial().extend({
  isArchived: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

const logEntrySchema = z.object({
  date: z.string(),                           // "YYYY-MM-DD"
  value: z.number().int().min(0).optional(),  // completion value (see schema docs)
  skipped: z.boolean().optional(),
  note: z.string().optional(),
});

// ─── GET /habits — list all habits ───────────────────────────────────

habitRoutes.get("/", async (c) => {
  const userId = c.get("userId");
  const includeArchived = c.req.query("archived") === "true";

  const result = await db
    .select()
    .from(habits)
    .where(eq(habits.userId, userId))
    .orderBy(habits.sortOrder);

  const filtered = includeArchived
    ? result
    : result.filter((h) => !h.isArchived);

  return c.json({ habits: filtered });
});

// ─── GET /habits/today — today's status for all active habits ────────

/**
 * Returns all active habits with today's log entry (if any).
 * The `completed` field indicates whether the user has met their goal.
 * This is the primary endpoint the iOS daily checklist screen calls.
 */
habitRoutes.get("/today", async (c) => {
  const userId = c.get("userId");
  const today = new Date().toISOString().split("T")[0]!;

  // Fetch active (non-archived) habits
  const userHabits = await db
    .select()
    .from(habits)
    .where(and(eq(habits.userId, userId), eq(habits.isArchived, false)))
    .orderBy(habits.sortOrder);

  // Fetch today's entries
  const todayEntries = await db
    .select()
    .from(habitEntries)
    .where(and(eq(habitEntries.userId, userId), eq(habitEntries.date, today)));

  // Map entries by habit ID for quick lookup
  const entryMap = new Map(todayEntries.map((e) => [e.habitId, e]));

  // Merge habits with their today status
  const result = userHabits.map((h) => {
    const entry = entryMap.get(h.id);
    return {
      ...h,
      todayEntry: entry || null,
      completed: (entry?.value ?? 0) >= (h.goalValue ?? 1),
    };
  });

  return c.json({ habits: result, date: today });
});

// ─── POST /habits — create a new habit ───────────────────────────────

habitRoutes.post("/", zValidator("json", createHabitSchema), async (c) => {
  const userId = c.get("userId");
  const data = c.req.valid("json");

  const [habit] = await db
    .insert(habits)
    .values({ userId, ...data })
    .returning();

  return c.json({ habit }, 201);
});

// ─── PATCH /habits/:id — update a habit ──────────────────────────────

habitRoutes.patch("/:id", zValidator("json", updateHabitSchema), async (c) => {
  const userId = c.get("userId");
  const habitId = c.req.param("id");
  const data = c.req.valid("json");

  const [habit] = await db
    .update(habits)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(habits.id, habitId), eq(habits.userId, userId)))
    .returning();

  if (!habit) return c.json({ error: "Habit not found" }, 404);
  return c.json({ habit });
});

// ─── DELETE /habits/:id — permanently delete a habit ─────────────────

/** Deletes a habit and all its log entries (cascade). Consider archiving instead. */
habitRoutes.delete("/:id", async (c) => {
  const userId = c.get("userId");
  const habitId = c.req.param("id");

  const [deleted] = await db
    .delete(habits)
    .where(and(eq(habits.id, habitId), eq(habits.userId, userId)))
    .returning();

  if (!deleted) return c.json({ error: "Habit not found" }, 404);
  return c.json({ message: "Habit deleted" });
});

// ─── POST /habits/:id/log — log a completion entry ───────────────────

/**
 * Creates or updates a log entry for a habit on a specific date.
 * If an entry already exists for that date, it's updated (upsert).
 *
 * For boolean habits, send `value: 1` to mark complete.
 * For numeric habits, send the tracked amount (e.g., `value: 2500`).
 * For timer habits, send seconds completed (e.g., `value: 600`).
 */
habitRoutes.post("/:id/log", zValidator("json", logEntrySchema), async (c) => {
  const userId = c.get("userId");
  const habitId = c.req.param("id");
  const { date, value, skipped, note } = c.req.valid("json");

  // Verify the habit belongs to this user
  const [habit] = await db
    .select()
    .from(habits)
    .where(and(eq(habits.id, habitId), eq(habits.userId, userId)))
    .limit(1);

  if (!habit) return c.json({ error: "Habit not found" }, 404);

  // Check for existing entry on this date (upsert pattern)
  const [existing] = await db
    .select()
    .from(habitEntries)
    .where(and(eq(habitEntries.habitId, habitId), eq(habitEntries.date, date)))
    .limit(1);

  if (existing) {
    // Update existing entry
    const [updated] = await db
      .update(habitEntries)
      .set({
        value: value ?? existing.value,
        skipped: skipped ?? existing.skipped,
        note: note ?? existing.note,
      })
      .where(eq(habitEntries.id, existing.id))
      .returning();
    return c.json({ entry: updated });
  }

  // Create new entry
  const [entry] = await db
    .insert(habitEntries)
    .values({
      habitId,
      userId,
      date,
      value: value ?? 1,
      skipped: skipped ?? false,
      note,
    })
    .returning();

  return c.json({ entry }, 201);
});

// ─── GET /habits/:id/logs — get log history ──────────────────────────

/**
 * Returns all log entries for a habit, ordered by date (newest first).
 * Used to build the calendar heatmap and streak calculations on iOS.
 *
 * Query params:
 *   ?from=2026-01-01  — filter from date (inclusive)
 *   ?to=2026-12-31    — filter to date (inclusive)
 */
habitRoutes.get("/:id/logs", async (c) => {
  const userId = c.get("userId");
  const habitId = c.req.param("id");

  // Verify ownership
  const [habit] = await db
    .select()
    .from(habits)
    .where(and(eq(habits.id, habitId), eq(habits.userId, userId)))
    .limit(1);

  if (!habit) return c.json({ error: "Habit not found" }, 404);

  const entries = await db
    .select()
    .from(habitEntries)
    .where(and(eq(habitEntries.habitId, habitId), eq(habitEntries.userId, userId)))
    .orderBy(desc(habitEntries.date));

  return c.json({ entries });
});
