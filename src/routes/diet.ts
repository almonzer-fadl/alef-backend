/**
 * Diet Module — Routes
 *
 * Meal tracking with macro rings and daily summaries.
 * Replaces MyFitnessPal — simpler, privacy-first, no ads.
 *
 * Routes:
 *   GET    /diet         — list recent meals (default 30, ordered by date desc)
 *   GET    /diet/day/:date — get all meals for a specific date
 *   POST   /diet         — create a meal entry
 *   PATCH  /diet/:id     — update a meal
 *   DELETE /diet/:id     — delete a meal
 *
 * Meal types: breakfast, lunch, dinner, snack
 * Macros: calories (int), protein/carbs/fat (double precision grams)
 */

import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { db } from "../db";
import { meals } from "../db/schema";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth } from "../middleware/auth";
import type { AuthEnv } from "../middleware/auth";

export const dietRoutes = new Hono<AuthEnv>();

// All diet routes require authentication
dietRoutes.use("*", requireAuth);

// ─── Validation Schemas ──────────────────────────────────────────────

const createMealSchema = z.object({
  date: z.string(),                           // "YYYY-MM-DD"
  mealType: z.enum(["breakfast", "lunch", "dinner", "snack"]),
  name: z.string().min(1, "Meal name is required"),
  calories: z.number().int().optional(),
  protein: z.number().optional(),             // grams
  carbs: z.number().optional(),               // grams
  fat: z.number().optional(),                 // grams
  description: z.string().optional(),
});

const updateMealSchema = createMealSchema.partial();

// ─── GET /diet — list recent meals ───────────────────────────────────

/**
 * Returns the most recent meals, ordered by date descending.
 * Used for the meal history/timeline view.
 *
 * Query params:
 *   ?limit=30  — number of meals to return (default 30)
 */
dietRoutes.get("/", async (c) => {
  const userId = c.get("userId");
  const limit = parseInt(c.req.query("limit") || "30");

  const result = await db
    .select()
    .from(meals)
    .where(eq(meals.userId, userId))
    .orderBy(desc(meals.date), desc(meals.createdAt))
    .limit(limit);

  return c.json({ meals: result });
});

// ─── GET /diet/day/:date — get all meals for a date ──────────────────

/**
 * Returns all meals for a specific date, grouped by meal type.
 * This is the primary endpoint for the daily diet view.
 *
 * Example: GET /diet/day/2026-03-07
 */
dietRoutes.get("/day/:date", async (c) => {
  const userId = c.get("userId");
  const date = c.req.param("date");

  const result = await db
    .select()
    .from(meals)
    .where(and(eq(meals.userId, userId), eq(meals.date, date)))
    .orderBy(meals.createdAt);

  return c.json({ meals: result, date });
});

// ─── POST /diet — create a meal ──────────────────────────────────────

dietRoutes.post("/", zValidator("json", createMealSchema), async (c) => {
  const userId = c.get("userId");
  const data = c.req.valid("json");

  const [meal] = await db
    .insert(meals)
    .values({ userId, ...data })
    .returning();

  return c.json({ meal }, 201);
});

// ─── PATCH /diet/:id — update a meal ─────────────────────────────────

dietRoutes.patch("/:id", zValidator("json", updateMealSchema), async (c) => {
  const userId = c.get("userId");
  const mealId = c.req.param("id");
  const data = c.req.valid("json");

  const [meal] = await db
    .update(meals)
    .set(data)
    .where(and(eq(meals.id, mealId), eq(meals.userId, userId)))
    .returning();

  if (!meal) return c.json({ error: "Meal not found" }, 404);
  return c.json({ meal });
});

// ─── DELETE /diet/:id — delete a meal ────────────────────────────────

dietRoutes.delete("/:id", async (c) => {
  const userId = c.get("userId");
  const mealId = c.req.param("id");

  const [deleted] = await db
    .delete(meals)
    .where(and(eq(meals.id, mealId), eq(meals.userId, userId)))
    .returning();

  if (!deleted) return c.json({ error: "Meal not found" }, 404);
  return c.json({ message: "Meal deleted" });
});
