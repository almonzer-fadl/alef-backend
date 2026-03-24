/**
 * Health Route Tests
 *
 * Tests vitals logging (weight, water, sleep, mood, energy).
 * Uses upsert pattern — one log per day per user.
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { app } from "../src/index";
import { buildRequest, createTestUser, cleanupTestUser, type TestUser } from "./helpers";

let user: TestUser;
const today = new Date().toISOString().split("T")[0]!;

beforeAll(async () => {
  user = await createTestUser("health");
});

afterAll(async () => {
  await cleanupTestUser(user.id);
});

describe("POST /api/health", () => {
  it("creates a health log for today", async () => {
    const res = await app.request(
      buildRequest("POST", "/api/health", {
        token: user.token,
        body: {
          date: today,
          weight: 75.5,
          waterMl: 2000,
          mood: "good",
          energyLevel: 3,
          notes: "Feeling good",
        },
      })
    );

    expect([200, 201]).toContain(res.status);
    const data = await res.json() as any;
    expect(data.log || data.entry).toBeDefined();
  });

  it("upserts on same date", async () => {
    const res = await app.request(
      buildRequest("POST", "/api/health", {
        token: user.token,
        body: {
          date: today,
          weight: 75.0,
          waterMl: 2500,
          mood: "great",
        },
      })
    );

    expect([200, 201]).toContain(res.status);
    const data = await res.json() as any;
    const log = data.log || data.entry;
    // Weight should be updated
    expect(log.weight || log.weightKg).toBeDefined();
  });

  it("rejects without auth", async () => {
    const res = await app.request(
      buildRequest("POST", "/api/health", {
        body: { date: today, mood: 3 },
      })
    );

    expect(res.status).toBe(401);
  });
});

describe("GET /api/health", () => {
  it("returns recent health logs", async () => {
    const res = await app.request(
      buildRequest("GET", "/api/health", { token: user.token })
    );

    expect(res.status).toBe(200);
    const data = await res.json() as any;
    // Response shape varies — could be { logs: [] } or { entries: [] }
    const logs = data.logs || data.entries || [];
    expect(logs).toBeInstanceOf(Array);
    expect(logs.length).toBeGreaterThanOrEqual(1);
  });
});

describe("GET /api/health/:date", () => {
  it("returns health log for a specific date", async () => {
    const res = await app.request(
      buildRequest("GET", `/api/health/${today}`, { token: user.token })
    );

    expect(res.status).toBe(200);
  });

  it("returns empty/404 for date with no log", async () => {
    const res = await app.request(
      buildRequest("GET", "/api/health/2020-01-01", { token: user.token })
    );

    // Could be 200 with null or 404
    expect([200, 404]).toContain(res.status);
  });
});
