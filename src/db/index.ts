/**
 * Database Connection
 *
 * Connects to PostgreSQL using the `postgres` driver and wraps it
 * with Drizzle ORM for type-safe queries.
 *
 * Connection string comes from DATABASE_URL env var.
 * Default: postgres://alef:alef@localhost:5432/alef (local dev)
 *
 * In production (self-hosted), Docker Compose sets this automatically.
 * For managed hosting (Supabase), users provide their own connection string.
 */

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString =
  process.env.DATABASE_URL || "postgres://alef:alef@localhost:5432/alef";

/** Postgres client — handles connection pooling automatically */
const client = postgres(connectionString);

/** Drizzle instance — use this for all database queries */
export const db = drizzle(client, { schema });
