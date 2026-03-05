CREATE TYPE "public"."frequency" AS ENUM('daily', 'weekly', 'monthly', 'custom');--> statement-breakpoint
CREATE TYPE "public"."goal_type" AS ENUM('boolean', 'numeric', 'timer');--> statement-breakpoint
CREATE TYPE "public"."media_status" AS ENUM('watchlist', 'watching', 'completed', 'dropped');--> statement-breakpoint
CREATE TYPE "public"."media_type" AS ENUM('movie', 'tv', 'book', 'podcast');--> statement-breakpoint
CREATE TYPE "public"."module_key" AS ENUM('habits', 'journal', 'health', 'sleep', 'fitness', 'diet', 'movies', 'books', 'projects', 'calendar');--> statement-breakpoint
CREATE TYPE "public"."mood" AS ENUM('great', 'good', 'okay', 'bad', 'terrible');--> statement-breakpoint
CREATE TABLE "habit_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"habit_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"date" date NOT NULL,
	"value" integer DEFAULT 0 NOT NULL,
	"skipped" boolean DEFAULT false,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "habits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"icon" text,
	"color" text DEFAULT '#34D399',
	"goal_type" "goal_type" DEFAULT 'boolean' NOT NULL,
	"goal_value" integer DEFAULT 1,
	"goal_unit" text,
	"frequency" "frequency" DEFAULT 'daily' NOT NULL,
	"reminder_time" text,
	"group_name" text,
	"is_archived" boolean DEFAULT false,
	"sort_order" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "health_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"date" date NOT NULL,
	"weight" double precision,
	"water_ml" integer,
	"sleep_hours" double precision,
	"sleep_quality" integer,
	"bedtime" text,
	"wake_time" text,
	"mood" "mood",
	"energy_level" integer,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "journal_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"date" date NOT NULL,
	"content" text NOT NULL,
	"mood" "mood",
	"energy_level" integer,
	"tags" text[],
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"date" date NOT NULL,
	"meal_type" text NOT NULL,
	"name" text NOT NULL,
	"calories" integer,
	"protein" double precision,
	"carbs" double precision,
	"fat" double precision,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" "media_type" NOT NULL,
	"status" "media_status" DEFAULT 'watchlist' NOT NULL,
	"title" text NOT NULL,
	"external_id" text,
	"poster_url" text,
	"rating" integer,
	"review" text,
	"progress" integer,
	"started_at" date,
	"completed_at" date,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_modules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"module_key" "module_key" NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"name" text NOT NULL,
	"avatar_url" text,
	"timezone" text DEFAULT 'UTC',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "workouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"date" date NOT NULL,
	"type" text NOT NULL,
	"duration_min" integer,
	"calories_burned" integer,
	"distance_km" double precision,
	"notes" text,
	"exercises" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "habit_entries" ADD CONSTRAINT "habit_entries_habit_id_habits_id_fk" FOREIGN KEY ("habit_id") REFERENCES "public"."habits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "habit_entries" ADD CONSTRAINT "habit_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "habits" ADD CONSTRAINT "habits_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "health_logs" ADD CONSTRAINT "health_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meals" ADD CONSTRAINT "meals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_items" ADD CONSTRAINT "media_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_modules" ADD CONSTRAINT "user_modules_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workouts" ADD CONSTRAINT "workouts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;