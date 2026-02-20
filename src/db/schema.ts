import { pgTable, text, timestamp, integer, boolean, doublePrecision, date, pgEnum, uuid } from "drizzle-orm/pg-core";

// ─── Enums ───────────────────────────────────────────────────────────

export const frequencyEnum = pgEnum("frequency", [
  "daily",
  "weekly",
  "monthly",
  "custom",
]);

export const moodEnum = pgEnum("mood", [
  "great",
  "good",
  "okay",
  "bad",
  "terrible",
]);

export const mediaTypeEnum = pgEnum("media_type", [
  "movie",
  "tv",
  "book",
  "podcast",
]);

export const mediaStatusEnum = pgEnum("media_status", [
  "watchlist",
  "watching",
  "completed",
  "dropped",
]);

// ─── Users ───────────────────────────────────────────────────────────

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  timezone: text("timezone").default("UTC"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ─── Habits ──────────────────────────────────────────────────────────

export const habits = pgTable("habits", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  emoji: text("emoji"),
  color: text("color").default("#E88213"),
  frequency: frequencyEnum("frequency").default("daily").notNull(),
  targetPerDay: integer("target_per_day").default(1),
  reminderTime: text("reminder_time"), // "08:00"
  isArchived: boolean("is_archived").default(false),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const habitLogs = pgTable("habit_logs", {
  id: uuid("id").defaultRandom().primaryKey(),
  habitId: uuid("habit_id").notNull().references(() => habits.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
  count: integer("count").default(1).notNull(),
  note: text("note"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── Journal ─────────────────────────────────────────────────────────

export const journalEntries = pgTable("journal_entries", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
  content: text("content").notNull(),
  mood: moodEnum("mood"),
  energyLevel: integer("energy_level"), // 1-5
  tags: text("tags").array(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ─── Health ──────────────────────────────────────────────────────────

export const healthLogs = pgTable("health_logs", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
  weight: doublePrecision("weight"),       // kg
  waterMl: integer("water_ml"),            // milliliters
  sleepHours: doublePrecision("sleep_hours"),
  sleepQuality: integer("sleep_quality"),  // 1-5
  bedtime: text("bedtime"),                // "23:30"
  wakeTime: text("wake_time"),             // "07:00"
  mood: moodEnum("mood"),
  energyLevel: integer("energy_level"),    // 1-5
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ─── Diet ────────────────────────────────────────────────────────────

export const meals = pgTable("meals", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
  name: text("name").notNull(),            // "Breakfast", "Lunch", etc.
  calories: integer("calories"),
  protein: doublePrecision("protein"),     // grams
  carbs: doublePrecision("carbs"),
  fat: doublePrecision("fat"),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── Fitness ─────────────────────────────────────────────────────────

export const workouts = pgTable("workouts", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
  type: text("type").notNull(),            // "running", "weights", "calisthenics"
  durationMin: integer("duration_min"),
  caloriesBurned: integer("calories_burned"),
  distanceKm: doublePrecision("distance_km"),
  notes: text("notes"),
  exercises: text("exercises"),            // JSON string of exercises
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── Media ───────────────────────────────────────────────────────────

export const mediaItems = pgTable("media_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: mediaTypeEnum("type").notNull(),
  status: mediaStatusEnum("status").default("watchlist").notNull(),
  title: text("title").notNull(),
  externalId: text("external_id"),         // TMDB/OpenLibrary ID
  posterUrl: text("poster_url"),
  rating: integer("rating"),               // 1-10
  review: text("review"),
  startedAt: date("started_at"),
  completedAt: date("completed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
