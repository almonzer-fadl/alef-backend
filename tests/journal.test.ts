/**
 * Journal Route Tests
 *
 * Tests daily journal entries with mood, energy, tags.
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { app } from "../src/index";
import { buildRequest, createTestUser, cleanupTestUser, type TestUser } from "./helpers";

let user: TestUser;
let entryId: string;

beforeAll(async () => {
  user = await createTestUser("journal");
});

afterAll(async () => {
  await cleanupTestUser(user.id);
});

describe("POST /api/journal", () => {
  it("creates a journal entry", async () => {
    const res = await app.request(
      buildRequest("POST", "/api/journal", {
        token: user.token,
        body: {
          date: new Date().toISOString().split("T")[0],
          content: "Today was a great day. Built the entire test suite.",
          mood: "great",
          energyLevel: 4,
          tags: ["coding", "productive"],
        },
      })
    );

    expect(res.status).toBe(201);
    const data = await res.json() as any;
    const entry = data.entry || data.journal;
    expect(entry).toBeDefined();
    expect(entry.content).toContain("great day");
    entryId = entry.id;
  });

  it("creates entry with minimal fields", async () => {
    const res = await app.request(
      buildRequest("POST", "/api/journal", {
        token: user.token,
        body: { date: new Date().toISOString().split("T")[0], content: "Quick note." },
      })
    );

    expect(res.status).toBe(201);
  });

  it("rejects empty content", async () => {
    const res = await app.request(
      buildRequest("POST", "/api/journal", {
        token: user.token,
        body: { date: new Date().toISOString().split("T")[0], content: "" },
      })
    );

    expect(res.status).toBe(400);
  });
});

describe("GET /api/journal", () => {
  it("lists journal entries", async () => {
    const res = await app.request(
      buildRequest("GET", "/api/journal", { token: user.token })
    );

    expect(res.status).toBe(200);
    const data = await res.json() as any;
    const entries = data.entries || data.journals || [];
    expect(entries).toBeInstanceOf(Array);
    expect(entries.length).toBeGreaterThanOrEqual(1);
  });
});

describe("GET /api/journal/:date", () => {
  const today = new Date().toISOString().split("T")[0]!;

  it("returns entry for today's date", async () => {
    const res = await app.request(
      buildRequest("GET", `/api/journal/${today}`, { token: user.token })
    );

    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.entry).toBeDefined();
  });

  it("returns null entry for date with no journal", async () => {
    const res = await app.request(
      buildRequest("GET", "/api/journal/2020-01-01", {
        token: user.token,
      })
    );

    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.entry).toBeNull();
  });
});

describe("PATCH /api/journal/:id", () => {
  it("updates entry content", async () => {
    const res = await app.request(
      buildRequest("PATCH", `/api/journal/${entryId}`, {
        token: user.token,
        body: { content: "Updated: even better day!", mood: "great" },
      })
    );

    expect(res.status).toBe(200);
    const data = await res.json() as any;
    const entry = data.entry || data.journal;
    expect(entry.content).toContain("Updated");
  });
});

describe("DELETE /api/journal/:id", () => {
  it("deletes a journal entry", async () => {
    // Create a throwaway entry
    const createRes = await app.request(
      buildRequest("POST", "/api/journal", {
        token: user.token,
        body: { date: new Date().toISOString().split("T")[0], content: "Delete me" },
      })
    );
    const { entry, journal } = await createRes.json() as any;
    const id = (entry || journal).id;

    const res = await app.request(
      buildRequest("DELETE", `/api/journal/${id}`, { token: user.token })
    );

    expect(res.status).toBe(200);
  });
});
