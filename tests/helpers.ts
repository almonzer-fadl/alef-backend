/**
 * Test Helpers
 *
 * Shared utilities for all test files:
 * - App instance creation (uses real Hono app, no HTTP server needed)
 * - Auth token generation for test users
 * - Database cleanup between tests
 * - Request builder for common patterns
 *
 * Bun's test runner uses `bun test` — zero extra dependencies.
 * Tests run against the actual app and a real PostgreSQL database.
 *
 * Environment:
 *   DATABASE_URL should point to a test database (not production).
 *   Tests clean up after themselves so order doesn't matter.
 */

import { db } from "../src/db";
import { users } from "../src/db/schema";
import { createToken, hashPassword } from "../src/lib/auth";
import { eq } from "drizzle-orm";

// ─── Types ───────────────────────────────────────────────────────────

export interface TestUser {
  id: string;
  email: string;
  name: string;
  token: string;
}

// ─── User Factory ────────────────────────────────────────────────────

/**
 * Create a test user in the database and return their details + token.
 *
 * Each test file should create its own user with a unique email
 * to avoid collisions when tests run in parallel.
 *
 * @param suffix - appended to email for uniqueness (e.g., "habits", "auth")
 */
export async function createTestUser(suffix: string): Promise<TestUser> {
  const email = `test-${suffix}-${Date.now()}@alef.test`;
  const passwordHash = await hashPassword("test-password-123");

  const [user] = await db
    .insert(users)
    .values({
      email,
      passwordHash,
      name: `Test User (${suffix})`,
      timezone: "UTC",
    })
    .returning();

  if (!user) throw new Error("Failed to create test user");

  const token = createToken(user.id);

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    token,
  };
}

// ─── Cleanup ─────────────────────────────────────────────────────────

/**
 * Remove a test user and all their cascade-deleted data.
 * Call this in afterAll() to clean up after tests.
 */
export async function cleanupTestUser(userId: string): Promise<void> {
  await db.delete(users).where(eq(users.id, userId));
}

// ─── Request Builder ─────────────────────────────────────────────────

/**
 * Build a Request object for Hono's app.request() method.
 * This is how we test Hono apps without spinning up an HTTP server.
 *
 * Usage:
 *   const res = await app.request(
 *     buildRequest("GET", "/api/habits", { token: user.token })
 *   );
 *
 * @param method - HTTP method
 * @param path - URL path (e.g., "/api/habits")
 * @param options - token for auth, body for POST/PATCH
 */
export function buildRequest(
  method: string,
  path: string,
  options: {
    token?: string;
    body?: Record<string, unknown>;
  } = {}
): Request {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (options.token) {
    headers["Authorization"] = `Bearer ${options.token}`;
  }

  const init: RequestInit = {
    method,
    headers,
  };

  if (options.body) {
    init.body = JSON.stringify(options.body);
  }

  return new Request(`http://localhost${path}`, init);
}

// ─── Response Helpers ────────────────────────────────────────────────

/** Parse response JSON with type assertion */
export async function json<T = unknown>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

/** Assert response status and return parsed JSON */
export async function expectJson<T = unknown>(
  res: Response,
  expectedStatus: number
): Promise<T> {
  if (res.status !== expectedStatus) {
    const body = await res.text();
    throw new Error(
      `Expected status ${expectedStatus}, got ${res.status}: ${body}`
    );
  }
  return (await res.json()) as T;
}
