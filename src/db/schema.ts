/**
 * Alef — أ — Database Schema
 *
 * Central schema definition for all Alef modules.
 * Each module's tables are grouped together and clearly labeled.
 *
 * Architecture: Alef uses a modular system where users can enable/disable
 * modules (habits, journal, health, etc.) from their profile. The
 * `user_modules` table tracks which modules each user has enabled.
 * All module-specific tables reference the user via `user_id`.
 *
 * Database: PostgreSQL (via Drizzle ORM)
 * Naming: snake_case for columns, camelCase in TypeScript
 */

import {
  pgTable,
  text,
  timestamp,
  integer,
  boolean,
  doublePrecision,
  date,
  pgEnum,
  uuid,
} from "drizzle-orm/pg-core";

// ─────────────────────────────────────────────────────────────────────
// Enums
// ─────────────────────────────────────────────────────────────────────

/** All available modules in Alef. Used for the module picker and routing. */
export const moduleEnum = pgEnum("module_key", [
  "habits",
  "journal",
  "health",
  "sleep",
  "fitness",
  "diet",
  "movies",
  "books",
  "projects",
  "calendar",
]);

/** How often a habit repeats */
export const frequencyEnum = pgEnum("frequency", [
  "daily",
  "weekly",
  "monthly",
  "custom",
]);

/** Mood scale — used across journal, health, and daily check-ins */
export const moodEnum = pgEnum("mood", [
  "great",
  "good",
  "okay",
  "bad",
  "terrible",
]);

/** What kind of habit goal this is */
export const goalTypeEnum = pgEnum("goal_type", [
  "boolean",  // did it or didn't (e.g., "Eat Breakfast")
  "numeric",  // measurable amount (e.g., "3000ml water")
  "timer",    // duration-based (e.g., "10 min meditation")
]);

/** Media type — movies, TV, books, podcasts */
export const mediaTypeEnum = pgEnum("media_type", [
  "movie",
  "tv",
  "book",
  "podcast",
]);

/** Media tracking status */
export const mediaStatusEnum = pgEnum("media_status", [
  "watchlist",
  "watching",
  "completed",
  "dropped",
]);

// ─────────────────────────────────────────────────────────────────────
// Core — Users & Modules
// ─────────────────────────────────────────────────────────────────────

/**
 * Users table.
 * Stores account credentials and basic profile info.
 * Every other table references this via `user_id`.
 */
export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  avatarUrl: text("avatar_url"),
  timezone: text("timezone").default("UTC"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

/**
 * Module preferences per user.
 *
 * During onboarding, users pick which modules they want.
 * This table tracks enabled/disabled state and display order.
 * The dashboard only shows cards for enabled modules.
 *
 * Example: A user who only wants habits + journal would have
 * two rows here with `enabled: true`, and all others `false`.
 */
export const userModules = pgTable("user_modules", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  moduleKey: moduleEnum("module_key").notNull(),
  enabled: boolean("enabled").default(true).notNull(),
  sortOrder: integer("sort_order").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─────────────────────────────────────────────────────────────────────
// Module: Habits
// ─────────────────────────────────────────────────────────────────────
// Replaces: Grit (HabitTracker)
// Features: streaks, heatmap, timer, daily checklist, focus sounds

/**
 * Habit definitions.
 *
 * Each habit has a goal type that determines how completion is tracked:
 * - `boolean`: simple did/didn't (tap to complete)
 * - `numeric`: track a value against a target (e.g., 2500/3000ml water)
 * - `timer`: track duration (e.g., 10 min meditation with built-in timer)
 *
 * Users can customise each habit with an icon, colour, and group.
 * The `sort_order` field controls display position in the daily list.
 */
export const habits = pgTable("habits", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  icon: text("icon"),                        // SF Symbol name or emoji
  color: text("color").default("#34D399"),   // hex — defaults to emerald (habits accent)
  goalType: goalTypeEnum("goal_type").default("boolean").notNull(),
  goalValue: integer("goal_value").default(1),  // target: 1 for boolean, ml/pages/mins for others
  goalUnit: text("goal_unit"),               // "ml", "pages", "minutes", null for boolean
  frequency: frequencyEnum("frequency").default("daily").notNull(),
  reminderTime: text("reminder_time"),       // "08:00" — local time
  groupName: text("group_name"),             // optional grouping (e.g., "Morning Routine")
  isArchived: boolean("is_archived").default(false),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

/**
 * Daily habit log entries.
 *
 * One row per habit per day. The `value` field stores:
 * - boolean habits: 1 (completed) or 0 (skipped)
 * - numeric habits: the tracked amount (e.g., 2500 for ml)
 * - timer habits: seconds completed (e.g., 600 for 10 minutes)
 *
 * `skipped` means the user explicitly marked it as skip (not just incomplete).
 * This distinction matters for streak calculation — skipped ≠ broken streak
 * if the user has configured "skip doesn't break streak".
 */
export const habitEntries = pgTable("habit_entries", {
  id: uuid("id").defaultRandom().primaryKey(),
  habitId: uuid("habit_id")
    .notNull()
    .references(() => habits.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
  value: integer("value").default(0).notNull(),  // see docstring above
  skipped: boolean("skipped").default(false),
  note: text("note"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─────────────────────────────────────────────────────────────────────
// Module: Journal
// ─────────────────────────────────────────────────────────────────────
// Replaces: Apple Notes (private journaling)
// Features: mood tags, ✕/—/✓ toggles, quick capture, search
// Inspired by: Bevel's journal with daytime/nighttime/automatic sections

/**
 * Journal entries — one per day (or multiple if the user writes more).
 *
 * The `mood` and `energy_level` provide quick daily check-in data
 * that feeds into the weekly review and cross-module insights.
 */
export const journalEntries = pgTable("journal_entries", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
  content: text("content").notNull(),
  mood: moodEnum("mood"),
  energyLevel: integer("energy_level"),  // 1-5
  tags: text("tags").array(),            // ["reflection", "goals", "gratitude"]
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ─────────────────────────────────────────────────────────────────────
// Module: Health
// ─────────────────────────────────────────────────────────────────────
// Replaces: Bevel / Apple Health
// Features: weight tracking, water intake, vitals, mood, sparkline charts

/**
 * Daily health log — one row per day.
 * Covers weight, hydration, sleep basics, mood, and energy.
 *
 * Sleep has its own dedicated fields here for simplicity,
 * but the Sleep module (when enabled) provides richer tracking
 * with stages, score calculations, and detailed trends.
 */
export const healthLogs = pgTable("health_logs", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
  weight: doublePrecision("weight"),         // kg
  waterMl: integer("water_ml"),              // milliliters consumed
  sleepHours: doublePrecision("sleep_hours"),
  sleepQuality: integer("sleep_quality"),    // 1-5 star rating
  bedtime: text("bedtime"),                  // "23:30" (local time)
  wakeTime: text("wake_time"),               // "07:00" (local time)
  mood: moodEnum("mood"),
  energyLevel: integer("energy_level"),      // 1-5
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ─────────────────────────────────────────────────────────────────────
// Module: Diet
// ─────────────────────────────────────────────────────────────────────
// Replaces: MyFitnessPal
// Features: macro rings, AI NLP input, meal timeline, food scan/photo

/**
 * Meals — individual food entries grouped by meal type.
 * The `description` field supports natural language input
 * (e.g., "2 eggs and toast") which the AI layer will parse
 * into estimated calories and macros.
 */
export const meals = pgTable("meals", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
  mealType: text("meal_type").notNull(),     // "breakfast", "lunch", "dinner", "snack"
  name: text("name").notNull(),              // "Oatmeal with Blueberries"
  calories: integer("calories"),
  protein: doublePrecision("protein"),       // grams
  carbs: doublePrecision("carbs"),           // grams
  fat: doublePrecision("fat"),               // grams
  description: text("description"),          // free-text or AI-parsed input
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─────────────────────────────────────────────────────────────────────
// Module: Fitness
// ─────────────────────────────────────────────────────────────────────
// Replaces: Strava / Bevel
// Features: workouts, runs, muscle radar chart, PRs, activity heatmap

/**
 * Workout sessions.
 * The `exercises` field stores a JSON array of exercise details
 * (sets, reps, weight) for strength workouts. Running/cycling
 * workouts use `distance_km` and `duration_min` instead.
 */
export const workouts = pgTable("workouts", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
  type: text("type").notNull(),              // "running", "strength", "cycling", "yoga", etc.
  durationMin: integer("duration_min"),
  caloriesBurned: integer("calories_burned"),
  distanceKm: doublePrecision("distance_km"),
  notes: text("notes"),
  exercises: text("exercises"),              // JSON: [{name, sets: [{reps, weight}]}]
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─────────────────────────────────────────────────────────────────────
// Module: Movies & TV + Books
// ─────────────────────────────────────────────────────────────────────
// Replaces: IMDB/Letterboxd (movies) + Goodreads/Apple Books (books)
// Features: poster grid, watchlist, ratings, reviews, progress tracking

/**
 * Media items — unified table for movies, TV shows, books, and podcasts.
 *
 * Uses `external_id` to link to TMDB (movies/TV) or Open Library (books)
 * for poster art, metadata, and search. Ratings are 1-10 (half-star
 * precision when divided by 2 for display as 1-5 stars).
 *
 * Books additionally track reading progress via `progress` (0-100).
 */
export const mediaItems = pgTable("media_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  type: mediaTypeEnum("type").notNull(),
  status: mediaStatusEnum("status").default("watchlist").notNull(),
  title: text("title").notNull(),
  externalId: text("external_id"),           // TMDB ID or Open Library key
  posterUrl: text("poster_url"),
  rating: integer("rating"),                 // 1-10
  review: text("review"),
  progress: integer("progress"),             // 0-100, mainly for books
  startedAt: date("started_at"),
  completedAt: date("completed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
