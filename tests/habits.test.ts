/**
 * Habits Route Tests
 *
 * Full CRUD coverage for habits and log entries.
 * Tests the core module of Alef — boolean, numeric, and timer habits.
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { app } from "../src/index";
import { buildRequest, createTestUser, cleanupTestUser, type TestUser } from "./helpers";

let user: TestUser;
let habitId: string;

beforeAll(async () => {
  user = await createTestUser("habits");
});

afterAll(async () => {
  await cleanupTestUser(user.id);
});

describe("POST /api/habits", () => {
  it("creates a boolean habit", async () => {
    const res = await app.request(
      buildRequest("POST", "/api/habits", {
        token: user.token,
        body: { name: "Meditate", icon: "brain.head.profile", color: "#34D399" },
      })
    );

    expect(res.status).toBe(201);
    const data = await res.json() as any;
    expect(data.habit.name).toBe("Meditate");
    expect(data.habit.goalType).toBe("boolean");
    expect(data.habit.userId).toBe(user.id);
    habitId = data.habit.id;
  });

  it("creates a numeric habit with goal", async () => {
    const res = await app.request(
      buildRequest("POST", "/api/habits", {
        token: user.token,
        body: {
          name: "Water",
          goalType: "numeric",
          goalValue: 2500,
          goalUnit: "ml",
        },
      })
    );

    expect(res.status).toBe(201);
    const data = await res.json() as any;
    expect(data.habit.goalType).toBe("numeric");
    expect(data.habit.goalValue).toBe(2500);
    expect(data.habit.goalUnit).toBe("ml");
  });

  it("creates a timer habit", async () => {
    const res = await app.request(
      buildRequest("POST", "/api/habits", {
        token: user.token,
        body: {
          name: "Read",
          goalType: "timer",
          goalValue: 1800,
          goalUnit: "seconds",
        },
      })
    );

    expect(res.status).toBe(201);
    const data = await res.json() as any;
    expect(data.habit.goalType).toBe("timer");
  });

  it("rejects habit without name", async () => {
    const res = await app.request(
      buildRequest("POST", "/api/habits", {
        token: user.token,
        body: { icon: "star" },
      })
    );

    expect(res.status).toBe(400);
  });

  it("rejects unauthenticated request", async () => {
    const res = await app.request(
      buildRequest("POST", "/api/habits", {
        body: { name: "Sneaky" },
      })
    );

    expect(res.status).toBe(401);
  });
});

describe("GET /api/habits", () => {
  it("lists all habits for user", async () => {
    const res = await app.request(
      buildRequest("GET", "/api/habits", { token: user.token })
    );

    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.habits).toBeInstanceOf(Array);
    expect(data.habits.length).toBeGreaterThanOrEqual(3);
  });

  it("excludes archived habits by default", async () => {
    // First archive a habit
    await app.request(
      buildRequest("PATCH", `/api/habits/${habitId}`, {
        token: user.token,
        body: { isArchived: true },
      })
    );

    const res = await app.request(
      buildRequest("GET", "/api/habits", { token: user.token })
    );

    const data = await res.json() as any;
    const found = data.habits.find((h: any) => h.id === habitId);
    expect(found).toBeUndefined();

    // Unarchive for subsequent tests
    await app.request(
      buildRequest("PATCH", `/api/habits/${habitId}`, {
        token: user.token,
        body: { isArchived: false },
      })
    );
  });

  it("includes archived habits with ?archived=true", async () => {
    // Archive again
    await app.request(
      buildRequest("PATCH", `/api/habits/${habitId}`, {
        token: user.token,
        body: { isArchived: true },
      })
    );

    const res = await app.request(
      buildRequest("GET", "/api/habits?archived=true", { token: user.token })
    );

    const data = await res.json() as any;
    const found = data.habits.find((h: any) => h.id === habitId);
    expect(found).toBeDefined();

    // Unarchive
    await app.request(
      buildRequest("PATCH", `/api/habits/${habitId}`, {
        token: user.token,
        body: { isArchived: false },
      })
    );
  });
});

describe("GET /api/habits/today", () => {
  it("returns today's habits with completion status", async () => {
    const res = await app.request(
      buildRequest("GET", "/api/habits/today", { token: user.token })
    );

    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.habits).toBeInstanceOf(Array);
    expect(data.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    // Each habit should have todayEntry and completed fields
    for (const h of data.habits) {
      expect(h).toHaveProperty("completed");
      expect(h).toHaveProperty("todayEntry");
    }
  });
});

describe("PATCH /api/habits/:id", () => {
  it("updates habit name", async () => {
    const res = await app.request(
      buildRequest("PATCH", `/api/habits/${habitId}`, {
        token: user.token,
        body: { name: "Meditate Daily" },
      })
    );

    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.habit.name).toBe("Meditate Daily");
  });

  it("returns 404 for non-existent habit", async () => {
    const res = await app.request(
      buildRequest("PATCH", "/api/habits/00000000-0000-0000-0000-000000000000", {
        token: user.token,
        body: { name: "Ghost" },
      })
    );

    expect(res.status).toBe(404);
  });
});

describe("POST /api/habits/:id/log", () => {
  const today = new Date().toISOString().split("T")[0]!;

  it("logs a boolean completion", async () => {
    const res = await app.request(
      buildRequest("POST", `/api/habits/${habitId}/log`, {
        token: user.token,
        body: { date: today, value: 1 },
      })
    );

    expect(res.status).toBe(201);
    const data = await res.json() as any;
    expect(data.entry.habitId).toBe(habitId);
    expect(data.entry.value).toBe(1);
    expect(data.entry.date).toBe(today);
  });

  it("upserts on same date (updates existing entry)", async () => {
    const res = await app.request(
      buildRequest("POST", `/api/habits/${habitId}/log`, {
        token: user.token,
        body: { date: today, value: 0, note: "Changed my mind" },
      })
    );

    // Upsert returns 200, not 201
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.entry.value).toBe(0);
    expect(data.entry.note).toBe("Changed my mind");
  });

  it("logs a skipped entry", async () => {
    const yesterday = new Date(Date.now() - 86400000)
      .toISOString()
      .split("T")[0]!;

    const res = await app.request(
      buildRequest("POST", `/api/habits/${habitId}/log`, {
        token: user.token,
        body: { date: yesterday, skipped: true },
      })
    );

    expect([200, 201]).toContain(res.status);
    const data = await res.json() as any;
    expect(data.entry.skipped).toBe(true);
  });
});

describe("GET /api/habits/:id/logs", () => {
  it("returns log history", async () => {
    const res = await app.request(
      buildRequest("GET", `/api/habits/${habitId}/logs`, {
        token: user.token,
      })
    );

    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.entries).toBeInstanceOf(Array);
    expect(data.entries.length).toBeGreaterThanOrEqual(1);
  });

  it("returns 404 for another user's habit", async () => {
    const other = await createTestUser("habits-other");

    const res = await app.request(
      buildRequest("GET", `/api/habits/${habitId}/logs`, {
        token: other.token,
      })
    );

    expect(res.status).toBe(404);
    await cleanupTestUser(other.id);
  });
});

describe("DELETE /api/habits/:id", () => {
  it("deletes a habit", async () => {
    // Create a throwaway habit to delete
    const createRes = await app.request(
      buildRequest("POST", "/api/habits", {
        token: user.token,
        body: { name: "To Be Deleted" },
      })
    );
    const { habit } = await createRes.json() as any;

    const res = await app.request(
      buildRequest("DELETE", `/api/habits/${habit.id}`, {
        token: user.token,
      })
    );

    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.message).toContain("deleted");
  });

  it("returns 404 for non-existent habit", async () => {
    const res = await app.request(
      buildRequest("DELETE", "/api/habits/00000000-0000-0000-0000-000000000000", {
        token: user.token,
      })
    );

    expect(res.status).toBe(404);
  });
});
