/**
 * Alef — Reminders Module Routes
 *
 * Endpoints:
 *   GET  /reminders              — list reminders (with filters)
 *   GET  /reminders/today        — reminders due today
 *   GET  /reminders/upcoming     — reminders due in next 7 days
 *   GET  /reminders/:id          — single reminder
 *   POST /reminders              — create reminder
 *   PATCH /reminders/:id         — update reminder
 *   DELETE /reminders/:id        — delete reminder
 *
 *   GET  /reminders/lists        — list all reminder lists with counts
 *   POST /reminders/lists        — create list
 *   PATCH /reminders/lists/:id   — update list
 *   DELETE /reminders/lists/:id  — delete list
 *
 * Filters for GET /reminders:
 *   ?listId=xxx      — reminders in a specific list
 *   ?completed=false — filter by completion status
 *   ?flagged=true    — only flagged reminders
 *   ?due=today       — due today
 *   ?due=upcoming    — due in next 7 days
 */

import { Hono } from "hono";
import { db } from "../db";
import { reminders, reminderLists } from "../db/schema";
import { eq, and, sql, isNull, desc, asc } from "drizzle-orm";
import { requireAuth } from "../middleware/auth";

const app = new Hono();

// Apply auth middleware to all routes
app.use("*", requireAuth);

// ─── Helper Functions ────────────────────────────────────────────────

/** Get today's date in YYYY-MM-DD format (server timezone) */
function getTodayString(): string {
  return new Date().toISOString().split("T")[0];
}

/** Get date N days from now in YYYY-MM-DD format */
function getDaysFromNow(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().split("T")[0];
}

// ─── Reminders ───────────────────────────────────────────────────────

/**
 * GET /reminders
 * List reminders with optional filters.
 */
app.get("/", async (c) => {
  const userId = c.get("userId") as string;
  const { listId, completed, flagged, due } = c.req.query();

  let conditions: any[] = [eq(reminders.userId, userId)];

  // Filter by list
  if (listId) {
    conditions.push(eq(reminders.listId, listId));
  }

  // Filter by completion status
  if (completed === "true") {
    conditions.push(eq(reminders.isCompleted, true));
  } else if (completed === "false") {
    conditions.push(eq(reminders.isCompleted, false));
  }

  // Filter by flagged
  if (flagged === "true") {
    conditions.push(eq(reminders.flagged, true));
  }

  // Filter by due date
  if (due === "today") {
    const today = getTodayString();
    conditions.push(eq(reminders.dueDate, today));
  } else if (due === "upcoming") {
    const today = getTodayString();
    const next7Days = getDaysFromNow(7);
    conditions.push(
      sql`${reminders.dueDate} >= ${today} AND ${reminders.dueDate} <= ${next7Days}`
    );
  }

  const result = await db
    .select()
    .from(reminders)
    .where(and(...conditions))
    .orderBy(
      desc(reminders.isCompleted), // Incomplete first
      asc(reminders.dueDate),       // Soonest due first
      desc(reminders.priority),     // Highest priority first
      desc(reminders.createdAt)
    );

  return c.json({ reminders: result });
});

/**
 * GET /reminders/today
 * Reminders due today.
 */
app.get("/today", async (c) => {
  const userId = c.get("userId") as string;
  const today = getTodayString();

  const result = await db
    .select()
    .from(reminders)
    .where(
      and(
        eq(reminders.userId, userId),
        eq(reminders.dueDate, today),
        eq(reminders.isCompleted, false)
      )
    )
    .orderBy(desc(reminders.priority), asc(reminders.dueTime));

  return c.json({ reminders: result, date: today });
});

/**
 * GET /reminders/upcoming
 * Reminders due in the next 7 days.
 */
app.get("/upcoming", async (c) => {
  const userId = c.get("userId") as string;
  const today = getTodayString();
  const next7Days = getDaysFromNow(7);

  const result = await db
    .select()
    .from(reminders)
    .where(
      and(
        eq(reminders.userId, userId),
        sql`${reminders.dueDate} >= ${today} AND ${reminders.dueDate} <= ${next7Days}`,
        eq(reminders.isCompleted, false)
      )
    )
    .orderBy(asc(reminders.dueDate), asc(reminders.dueTime));

  return c.json({ reminders: result });
});

/**
 * GET /reminders/:id
 * Get a single reminder by ID.
 */
app.get("/:id", async (c) => {
  const userId = c.get("userId") as string;
  const { id } = c.req.param();

  const [reminder] = await db
    .select()
    .from(reminders)
    .where(and(eq(reminders.id, id), eq(reminders.userId, userId)))
    .limit(1);

  if (!reminder) {
    return c.json({ error: "Reminder not found" }, 404);
  }

  return c.json({ reminder });
});

/**
 * POST /reminders
 * Create a new reminder.
 */
app.post("/", async (c) => {
  const userId = c.get("userId") as string;
  const body = await c.req.json();

  const { title, notes, listId, priority, dueDate, dueTime, recurrence, flagged, url } = body;

  if (!title) {
    return c.json({ error: "Title is required" }, 400);
  }

  const [reminder] = await db
    .insert(reminders)
    .values({
      userId,
      listId: listId || null,
      title,
      notes: notes || null,
      priority: priority ?? 0,
      dueDate: dueDate || null,
      dueTime: dueTime || null,
      recurrence: recurrence || null,
      flagged: flagged ?? false,
      url: url || null,
    })
    .returning();

  return c.json({ reminder }, 201);
});

/**
 * PATCH /reminders/:id
 * Update a reminder (including toggling completion).
 */
app.patch("/:id", async (c) => {
  const userId = c.get("userId") as string;
  const { id } = c.req.param();
  const body = await c.req.json();

  // Check ownership
  const [existing] = await db
    .select()
    .from(reminders)
    .where(and(eq(reminders.id, id), eq(reminders.userId, userId)))
    .limit(1);

  if (!existing) {
    return c.json({ error: "Reminder not found" }, 404);
  }

  // Build update object
  const updates: any = { updatedAt: new Date() };

  if (body.title !== undefined) updates.title = body.title;
  if (body.notes !== undefined) updates.notes = body.notes;
  if (body.listId !== undefined) updates.listId = body.listId;
  if (body.priority !== undefined) updates.priority = body.priority;
  if (body.dueDate !== undefined) updates.dueDate = body.dueDate;
  if (body.dueTime !== undefined) updates.dueTime = body.dueTime;
  if (body.recurrence !== undefined) updates.recurrence = body.recurrence;
  if (body.flagged !== undefined) updates.flagged = body.flagged;
  if (body.url !== undefined) updates.url = body.url;

  // Handle completion toggle
  if (body.isCompleted !== undefined) {
    updates.isCompleted = body.isCompleted;
    updates.completedAt = body.isCompleted ? new Date() : null;
  }

  const [reminder] = await db
    .update(reminders)
    .set(updates)
    .where(eq(reminders.id, id))
    .returning();

  return c.json({ reminder });
});

/**
 * DELETE /reminders/:id
 * Delete a reminder permanently.
 */
app.delete("/:id", async (c) => {
  const userId = c.get("userId") as string;
  const { id } = c.req.param();

  const [existing] = await db
    .select()
    .from(reminders)
    .where(and(eq(reminders.id, id), eq(reminders.userId, userId)))
    .limit(1);

  if (!existing) {
    return c.json({ error: "Reminder not found" }, 404);
  }

  await db.delete(reminders).where(eq(reminders.id, id));

  return c.json({ message: "Reminder deleted" });
});

// ─── Reminder Lists ──────────────────────────────────────────────────

/**
 * GET /reminders/lists
 * List all reminder lists with counts.
 */
app.get("/lists", async (c) => {
  const userId = c.get("userId") as string;

  // Fetch all lists
  const lists = await db
    .select()
    .from(reminderLists)
    .where(eq(reminderLists.userId, userId))
    .orderBy(asc(reminderLists.sortOrder), desc(reminderLists.createdAt));

  // Fetch counts for each list
  const listsWithCounts = await Promise.all(
    lists.map(async (list) => {
      const [result] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(reminders)
        .where(and(eq(reminders.listId, list.id), eq(reminders.isCompleted, false)));

      return {
        ...list,
        count: result?.count || 0,
      };
    })
  );

  // Calculate smart list counts
  const today = getTodayString();
  const next7Days = getDaysFromNow(7);

  const [todayCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(reminders)
    .where(
      and(
        eq(reminders.userId, userId),
        eq(reminders.dueDate, today),
        eq(reminders.isCompleted, false)
      )
    );

  const [upcomingCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(reminders)
    .where(
      and(
        eq(reminders.userId, userId),
        sql`${reminders.dueDate} >= ${today} AND ${reminders.dueDate} <= ${next7Days}`,
        eq(reminders.isCompleted, false)
      )
    );

  const [allCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(reminders)
    .where(and(eq(reminders.userId, userId), eq(reminders.isCompleted, false)));

  const [flaggedCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(reminders)
    .where(
      and(eq(reminders.userId, userId), eq(reminders.flagged, true), eq(reminders.isCompleted, false))
    );

  return c.json({
    lists: listsWithCounts,
    smartLists: {
      today: todayCount?.count || 0,
      upcoming: upcomingCount?.count || 0,
      all: allCount?.count || 0,
      flagged: flaggedCount?.count || 0,
    },
  });
});

/**
 * POST /reminders/lists
 * Create a new reminder list.
 */
app.post("/lists", async (c) => {
  const userId = c.get("userId") as string;
  const body = await c.req.json();

  const { name, icon, color, sortOrder } = body;

  if (!name) {
    return c.json({ error: "Name is required" }, 400);
  }

  const [list] = await db
    .insert(reminderLists)
    .values({
      userId,
      name,
      icon: icon || "list.bullet",
      color: color || "#60A5FA",
      sortOrder: sortOrder ?? 0,
    })
    .returning();

  return c.json({ list }, 201);
});

/**
 * PATCH /reminders/lists/:id
 * Update a reminder list.
 */
app.patch("/lists/:id", async (c) => {
  const userId = c.get("userId") as string;
  const { id } = c.req.param();
  const body = await c.req.json();

  // Check ownership
  const [existing] = await db
    .select()
    .from(reminderLists)
    .where(and(eq(reminderLists.id, id), eq(reminderLists.userId, userId)))
    .limit(1);

  if (!existing) {
    return c.json({ error: "List not found" }, 404);
  }

  // Build update object
  const updates: any = {};

  if (body.name !== undefined) updates.name = body.name;
  if (body.icon !== undefined) updates.icon = body.icon;
  if (body.color !== undefined) updates.color = body.color;
  if (body.sortOrder !== undefined) updates.sortOrder = body.sortOrder;

  const [list] = await db
    .update(reminderLists)
    .set(updates)
    .where(eq(reminderLists.id, id))
    .returning();

  return c.json({ list });
});

/**
 * DELETE /reminders/lists/:id
 * Delete a reminder list (cascades to reminders).
 */
app.delete("/lists/:id", async (c) => {
  const userId = c.get("userId") as string;
  const { id } = c.req.param();

  const [existing] = await db
    .select()
    .from(reminderLists)
    .where(and(eq(reminderLists.id, id), eq(reminderLists.userId, userId)))
    .limit(1);

  if (!existing) {
    return c.json({ error: "List not found" }, 404);
  }

  await db.delete(reminderLists).where(eq(reminderLists.id, id));

  return c.json({ message: "List deleted" });
});

export default app;
