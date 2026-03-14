/**
 * Calendar Routes
 * 
 * Endpoints for managing calendar events — inspired by Apple Calendar.
 * Supports all-day events, recurrence, reminders, and location.
 */

import { Hono } from "hono";
import { z } from "zod";
import { db } from "../db";
import { events } from "../db/schema";
import { eq, and, gte, lte, desc } from "drizzle-orm";
import { requireAuth } from "../middleware/auth";

const app = new Hono();

// Apply auth middleware to all routes
app.use("/*", requireAuth);

// ─────────────────────────────────────────────────────────────────────
// Validation Schemas
// ─────────────────────────────────────────────────────────────────────

const createEventSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  startTime: z.string().datetime(),
  endTime: z.string().datetime().optional(),
  allDay: z.boolean().optional().default(false),
  location: z.string().optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional().default("#A78BFA"),
  recurrence: z.enum(["daily", "weekly", "monthly", "yearly"]).optional(),
  remindMinutes: z.number().int().optional(),
});

const updateEventSchema = createEventSchema.partial();

// ─────────────────────────────────────────────────────────────────────
// Routes
// ─────────────────────────────────────────────────────────────────────

/**
 * GET /calendar
 * List events with optional date range filtering
 * Query params: ?from=2026-03-01T00:00:00Z&to=2026-03-31T23:59:59Z
 */
app.get("/", async (c) => {
  const userId = c.get("userId");
  const from = c.req.query("from");
  const to = c.req.query("to");

  try {
    let query = db
      .select()
      .from(events)
      .where(eq(events.userId, userId))
      .orderBy(desc(events.startTime));

    // Apply date range filters if provided
    if (from && to) {
      query = db
        .select()
        .from(events)
        .where(
          and(
            eq(events.userId, userId),
            gte(events.startTime, new Date(from)),
            lte(events.startTime, new Date(to))
          )
        )
        .orderBy(events.startTime);
    }

    const allEvents = await query;

    return c.json({
      success: true,
      data: allEvents,
    });
  } catch (error) {
    console.error("Error fetching events:", error);
    return c.json({ success: false, error: "Failed to fetch events" }, 500);
  }
});

/**
 * GET /calendar/day/:date
 * Get all events for a specific date
 * Params: date in YYYY-MM-DD format
 */
app.get("/day/:date", async (c) => {
  const userId = c.get("userId");
  const date = c.req.param("date");

  try {
    // Parse the date and create start/end of day boundaries
    const startOfDay = new Date(`${date}T00:00:00Z`);
    const endOfDay = new Date(`${date}T23:59:59Z`);

    const dayEvents = await db
      .select()
      .from(events)
      .where(
        and(
          eq(events.userId, userId),
          gte(events.startTime, startOfDay),
          lte(events.startTime, endOfDay)
        )
      )
      .orderBy(events.startTime);

    return c.json({
      success: true,
      data: dayEvents,
    });
  } catch (error) {
    console.error("Error fetching day events:", error);
    return c.json({ success: false, error: "Failed to fetch day events" }, 500);
  }
});

/**
 * GET /calendar/:id
 * Get a single event by ID
 */
app.get("/:id", async (c) => {
  const userId = c.get("userId");
  const eventId = c.req.param("id");

  try {
    const [event] = await db
      .select()
      .from(events)
      .where(and(eq(events.id, eventId), eq(events.userId, userId)));

    if (!event) {
      return c.json({ success: false, error: "Event not found" }, 404);
    }

    return c.json({
      success: true,
      data: event,
    });
  } catch (error) {
    console.error("Error fetching event:", error);
    return c.json({ success: false, error: "Failed to fetch event" }, 500);
  }
});

/**
 * POST /calendar
 * Create a new event
 */
app.post("/", async (c) => {
  const userId = c.get("userId");

  try {
    const body = await c.req.json();
    const validatedData = createEventSchema.parse(body);

    const [newEvent] = await db
      .insert(events)
      .values({
        userId,
        title: validatedData.title,
        description: validatedData.description,
        startTime: new Date(validatedData.startTime),
        endTime: validatedData.endTime ? new Date(validatedData.endTime) : null,
        allDay: validatedData.allDay,
        location: validatedData.location,
        color: validatedData.color,
        recurrence: validatedData.recurrence,
        remindMinutes: validatedData.remindMinutes,
      })
      .returning();

    return c.json({
      success: true,
      data: newEvent,
    }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json(
        { success: false, error: "Validation failed", details: error.errors },
        400
      );
    }
    console.error("Error creating event:", error);
    return c.json({ success: false, error: "Failed to create event" }, 500);
  }
});

/**
 * PATCH /calendar/:id
 * Update an existing event
 */
app.patch("/:id", async (c) => {
  const userId = c.get("userId");
  const eventId = c.req.param("id");

  try {
    const body = await c.req.json();
    const validatedData = updateEventSchema.parse(body);

    // Build update object, converting date strings to Date objects
    const updateData: any = { updatedAt: new Date() };
    
    if (validatedData.title !== undefined) updateData.title = validatedData.title;
    if (validatedData.description !== undefined) updateData.description = validatedData.description;
    if (validatedData.startTime !== undefined) updateData.startTime = new Date(validatedData.startTime);
    if (validatedData.endTime !== undefined) updateData.endTime = validatedData.endTime ? new Date(validatedData.endTime) : null;
    if (validatedData.allDay !== undefined) updateData.allDay = validatedData.allDay;
    if (validatedData.location !== undefined) updateData.location = validatedData.location;
    if (validatedData.color !== undefined) updateData.color = validatedData.color;
    if (validatedData.recurrence !== undefined) updateData.recurrence = validatedData.recurrence;
    if (validatedData.remindMinutes !== undefined) updateData.remindMinutes = validatedData.remindMinutes;

    const [updatedEvent] = await db
      .update(events)
      .set(updateData)
      .where(and(eq(events.id, eventId), eq(events.userId, userId)))
      .returning();

    if (!updatedEvent) {
      return c.json({ success: false, error: "Event not found" }, 404);
    }

    return c.json({
      success: true,
      data: updatedEvent,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json(
        { success: false, error: "Validation failed", details: error.errors },
        400
      );
    }
    console.error("Error updating event:", error);
    return c.json({ success: false, error: "Failed to update event" }, 500);
  }
});

/**
 * DELETE /calendar/:id
 * Delete an event
 */
app.delete("/:id", async (c) => {
  const userId = c.get("userId");
  const eventId = c.req.param("id");

  try {
    const [deletedEvent] = await db
      .delete(events)
      .where(and(eq(events.id, eventId), eq(events.userId, userId)))
      .returning();

    if (!deletedEvent) {
      return c.json({ success: false, error: "Event not found" }, 404);
    }

    return c.json({
      success: true,
      message: "Event deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting event:", error);
    return c.json({ success: false, error: "Failed to delete event" }, 500);
  }
});

export const calendarRoutes = app;
