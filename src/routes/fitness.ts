/**
 * Fitness Module — Routes
 *
 * Workout tracking for Alef. Replaces Strava/Bevel.
 * Supports multiple workout types:
 *   - Cardio: running, cycling, swimming, walking (distance + duration)
 *   - Strength: structured exercises with sets, reps, and weight
 *   - Other: yoga, HIIT, general workouts
 *
 * Routes:
 *   GET    /fitness         — list recent workouts (default 30, ordered by date desc)
 *   GET    /fitness/:id     — get a single workout by id
 *   POST   /fitness         — create a workout
 *   PATCH  /fitness/:id     — update a workout
 *   DELETE /fitness/:id     — delete a workout
 *
 * The `exercises` field stores a JSON string for strength workouts:
 *   [{name: "Bench Press", sets: [{reps: 10, weight: 60}, {reps: 8, weight: 65}]}]
 */

import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { db } from "../db";
import { workouts } from "../db/schema";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth } from "../middleware/auth";
import type { AuthEnv } from "../middleware/auth";

export const fitnessRoutes = new Hono<AuthEnv>();

// All fitness routes require authentication
fitnessRoutes.use("*", requireAuth);

// ─── Validation Schemas ──────────────────────────────────────────────

const createWorkoutSchema = z.object({
  date: z.string(),                           // "YYYY-MM-DD"
  type: z.string().min(1, "Workout type is required"), // "running", "strength", etc.
  durationMin: z.number().int().min(0).optional(),
  caloriesBurned: z.number().int().min(0).optional(),
  distanceKm: z.number().min(0).optional(),
  notes: z.string().optional(),
  exercises: z.string().optional(),           // JSON string for strength workouts
});

const updateWorkoutSchema = createWorkoutSchema.partial();

// ─── GET /fitness — list recent workouts ─────────────────────────────

/**
 * Returns recent workouts ordered by date (newest first).
 * Query params:
 *   ?limit=30  — max number of workouts to return (default 30)
 */
fitnessRoutes.get("/", async (c) => {
  const userId = c.get("userId");
  const limitParam = c.req.query("limit");
  const limit = limitParam ? parseInt(limitParam) : 30;

  const result = await db
    .select()
    .from(workouts)
    .where(eq(workouts.userId, userId))
    .orderBy(desc(workouts.date))
    .limit(limit);

  return c.json({ workouts: result });
});

// ─── GET /fitness/:id — get a single workout ─────────────────────────

fitnessRoutes.get("/:id", async (c) => {
  const userId = c.get("userId");
  const workoutId = c.req.param("id");

  const [workout] = await db
    .select()
    .from(workouts)
    .where(and(eq(workouts.id, workoutId), eq(workouts.userId, userId)))
    .limit(1);

  if (!workout) return c.json({ error: "Workout not found" }, 404);
  return c.json({ workout });
});

// ─── POST /fitness — create a workout ────────────────────────────────

fitnessRoutes.post("/", zValidator("json", createWorkoutSchema), async (c) => {
  const userId = c.get("userId");
  const data = c.req.valid("json");

  const [workout] = await db
    .insert(workouts)
    .values({ userId, ...data })
    .returning();

  return c.json({ workout }, 201);
});

// ─── PATCH /fitness/:id — update a workout ───────────────────────────

fitnessRoutes.patch("/:id", zValidator("json", updateWorkoutSchema), async (c) => {
  const userId = c.get("userId");
  const workoutId = c.req.param("id");
  const data = c.req.valid("json");

  const [workout] = await db
    .update(workouts)
    .set(data)
    .where(and(eq(workouts.id, workoutId), eq(workouts.userId, userId)))
    .returning();

  if (!workout) return c.json({ error: "Workout not found" }, 404);
  return c.json({ workout });
});

// ─── DELETE /fitness/:id — delete a workout ──────────────────────────

fitnessRoutes.delete("/:id", async (c) => {
  const userId = c.get("userId");
  const workoutId = c.req.param("id");

  const [deleted] = await db
    .delete(workouts)
    .where(and(eq(workouts.id, workoutId), eq(workouts.userId, userId)))
    .returning();

  if (!deleted) return c.json({ error: "Workout not found" }, 404);
  return c.json({ message: "Workout deleted" });
});
