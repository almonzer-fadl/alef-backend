/**
 * Module Management Routes
 *
 * Alef is modular — users choose which life-tracking modules they want.
 * This route handles enabling, disabling, and reordering modules.
 *
 * During onboarding, the iOS app sends a list of modules the user picked.
 * The dashboard only shows cards for enabled modules.
 *
 * Routes:
 *   GET  /modules       — list user's modules with enabled/disabled state
 *   POST /modules/setup — bulk enable modules (used during onboarding)
 *   PATCH /modules/:key — toggle or reorder a single module
 */

import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { db } from "../db";
import { userModules } from "../db/schema";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middleware/auth";
import type { AuthEnv } from "../middleware/auth";

export const moduleRoutes = new Hono<AuthEnv>();

moduleRoutes.use("*", requireAuth);

/**
 * All available modules with their display metadata.
 * This is the source of truth for what modules exist in Alef.
 * The iOS app uses this list to render the module picker grid.
 */
const ALL_MODULES = [
  { key: "habits",   label: "Habits",      icon: "checkmark.circle.fill", color: "#34D399", description: "Build streaks, track daily habits" },
  { key: "journal",  label: "Journal",     icon: "book.fill",             color: "#F472B6", description: "Daily reflections, mood, thoughts" },
  { key: "health",   label: "Health",      icon: "heart.fill",            color: "#60A5FA", description: "Weight, water, vitals, mood" },
  { key: "sleep",    label: "Sleep",       icon: "moon.fill",             color: "#818CF8", description: "Sleep tracking, quality, trends" },
  { key: "fitness",  label: "Fitness",     icon: "figure.run",            color: "#F87171", description: "Workouts, runs, personal records" },
  { key: "diet",     label: "Diet",        icon: "fork.knife",            color: "#FB923C", description: "Meals, calories, macros" },
  { key: "movies",   label: "Movies & TV", icon: "film.fill",             color: "#FBBF24", description: "Watchlist, ratings, reviews" },
  { key: "books",    label: "Books",       icon: "text.book.closed.fill", color: "#2DD4BF", description: "Reading list, progress, goals" },
  { key: "projects", label: "Projects",    icon: "square.grid.2x2.fill",  color: "#22D3EE", description: "Tasks, boards, deadlines" },
  { key: "calendar", label: "Calendar",    icon: "calendar",              color: "#A78BFA", description: "Events, schedule, reminders" },
] as const;

/** Valid module key strings for type safety */
type ModuleKey = typeof ALL_MODULES[number]["key"];

// ─── GET /modules — list all modules with user's preferences ─────────

moduleRoutes.get("/", async (c) => {
  const userId = c.get("userId");

  // Fetch user's saved module preferences
  const saved = await db
    .select()
    .from(userModules)
    .where(eq(userModules.userId, userId));

  const savedMap = new Map(saved.map((m) => [m.moduleKey, m]));

  // Merge with ALL_MODULES so the client always gets the full list,
  // even for modules the user hasn't explicitly configured yet.
  const modules = ALL_MODULES.map((mod, index) => {
    const userMod = savedMap.get(mod.key);
    return {
      ...mod,
      enabled: userMod?.enabled ?? false,
      sortOrder: userMod?.sortOrder ?? index,
    };
  });

  // Sort by user's preferred order
  modules.sort((a, b) => a.sortOrder - b.sortOrder);

  return c.json({ modules });
});

// ─── POST /modules/setup — bulk enable during onboarding ─────────────

const setupSchema = z.object({
  /** Array of module keys the user wants enabled, e.g. ["habits", "journal"] */
  enabled: z.array(z.string()).min(1, "Pick at least one module"),
});

moduleRoutes.post("/setup", zValidator("json", setupSchema), async (c) => {
  const userId = c.get("userId");
  const { enabled } = c.req.valid("json");

  // Validate that all provided keys are real modules
  const validKeys = new Set(ALL_MODULES.map((m) => m.key));
  const invalid = enabled.filter((k) => !validKeys.has(k as ModuleKey));
  if (invalid.length > 0) {
    return c.json({ error: `Unknown modules: ${invalid.join(", ")}` }, 400);
  }

  // Delete existing preferences (fresh start on setup)
  await db.delete(userModules).where(eq(userModules.userId, userId));

  // Insert all modules — enabled ones first, then disabled ones
  const rows = ALL_MODULES.map((mod, index) => ({
    userId,
    moduleKey: mod.key as ModuleKey,
    enabled: enabled.includes(mod.key),
    sortOrder: enabled.includes(mod.key)
      ? enabled.indexOf(mod.key)         // enabled modules sorted by user's pick order
      : 100 + index,                     // disabled modules at the end
  }));

  await db.insert(userModules).values(rows);

  return c.json({ message: "Modules configured", enabled }, 201);
});

// ─── PATCH /modules/:key — toggle or reorder a single module ─────────

const patchSchema = z.object({
  enabled: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

moduleRoutes.patch("/:key", zValidator("json", patchSchema), async (c) => {
  const userId = c.get("userId");
  const key = c.req.param("key") as ModuleKey;
  const data = c.req.valid("json");

  // Check if a row exists for this module
  const [existing] = await db
    .select()
    .from(userModules)
    .where(and(eq(userModules.userId, userId), eq(userModules.moduleKey, key)))
    .limit(1);

  if (!existing) {
    // First time toggling this module — create a row
    const [created] = await db
      .insert(userModules)
      .values({
        userId,
        moduleKey: key,
        enabled: data.enabled ?? true,
        sortOrder: data.sortOrder ?? 99,
      })
      .returning();
    return c.json({ module: created }, 201);
  }

  // Update existing
  const [updated] = await db
    .update(userModules)
    .set(data)
    .where(eq(userModules.id, existing.id))
    .returning();

  return c.json({ module: updated });
});
