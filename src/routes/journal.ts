/**
 * Journal Module — Routes
 *
 * Replaces Apple Notes for private daily journaling.
 * Supports mood tracking, energy levels, tags, and free-text entries.
 *
 * Routes:
 *   GET    /journal       — list recent entries (default 30)
 *   POST   /journal       — create a new entry
 *   GET    /journal/:date — get entry for a specific date
 *   PATCH  /journal/:id   — update an entry
 *   DELETE /journal/:id   — delete an entry
 *
 * TODO: Add Bevel-style toggle fields (✕/—/✓ for daytime/nighttime/auto)
 * TODO: Add "copy from yesterday" endpoint
 * TODO: Add full-text search
 */

import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { db } from "../db";
import { journalEntries } from "../db/schema";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth } from "../middleware/auth";
import type { AuthEnv } from "../middleware/auth";

export const journalRoutes = new Hono<AuthEnv>();

journalRoutes.use("*", requireAuth);

const journalSchema = z.object({
  date: z.string(),
  content: z.string().min(1),
  mood: z.enum(["great", "good", "okay", "bad", "terrible"]).optional(),
  energyLevel: z.number().int().min(1).max(5).optional(),
  tags: z.array(z.string()).optional(),
});

// GET /journal — list recent entries
journalRoutes.get("/", async (c) => {
  const userId = c.get("userId");
  const limit = parseInt(c.req.query("limit") || "30");

  const entries = await db
    .select()
    .from(journalEntries)
    .where(eq(journalEntries.userId, userId))
    .orderBy(desc(journalEntries.date))
    .limit(limit);

  return c.json({ entries });
});

// POST /journal — create a new entry
journalRoutes.post("/", zValidator("json", journalSchema), async (c) => {
  const userId = c.get("userId");
  const data = c.req.valid("json");

  const [entry] = await db
    .insert(journalEntries)
    .values({ userId, ...data })
    .returning();

  return c.json({ entry }, 201);
});

// GET /journal/:date — get entry for a specific date
journalRoutes.get("/:date", async (c) => {
  const userId = c.get("userId");
  const date = c.req.param("date");

  const [entry] = await db
    .select()
    .from(journalEntries)
    .where(and(eq(journalEntries.userId, userId), eq(journalEntries.date, date)))
    .limit(1);

  return c.json({ entry: entry || null });
});

// PATCH /journal/:id — update an entry
journalRoutes.patch("/:id", zValidator("json", journalSchema.partial()), async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");
  const data = c.req.valid("json");

  const [entry] = await db
    .update(journalEntries)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(journalEntries.id, id), eq(journalEntries.userId, userId)))
    .returning();

  if (!entry) return c.json({ error: "Entry not found" }, 404);
  return c.json({ entry });
});

// DELETE /journal/:id — delete an entry
journalRoutes.delete("/:id", async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");

  const [deleted] = await db
    .delete(journalEntries)
    .where(and(eq(journalEntries.id, id), eq(journalEntries.userId, userId)))
    .returning();

  if (!deleted) return c.json({ error: "Entry not found" }, 404);
  return c.json({ message: "Entry deleted" });
});
