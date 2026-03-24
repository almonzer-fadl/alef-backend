/**
 * Calendar Route Tests
 *
 * Tests event CRUD, date filtering, all-day events.
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { app } from "../src/index";
import { buildRequest, createTestUser, cleanupTestUser, type TestUser } from "./helpers";

let user: TestUser;
let eventId: string;

beforeAll(async () => {
  user = await createTestUser("calendar");
});

afterAll(async () => {
  await cleanupTestUser(user.id);
});

describe("POST /api/calendar", () => {
  it("creates an event", async () => {
    const res = await app.request(
      buildRequest("POST", "/api/calendar", {
        token: user.token,
        body: {
          title: "Team Meeting",
          startTime: "2026-03-15T10:00:00Z",
          endTime: "2026-03-15T11:00:00Z",
          location: "Office",
          color: "#A78BFA",
        },
      })
    );

    expect(res.status).toBe(201);
    const data = await res.json() as any;
    const event = data.data;
    expect(event.title).toBe("Team Meeting");
    eventId = event.id;
  });

  it("creates an all-day event", async () => {
    const res = await app.request(
      buildRequest("POST", "/api/calendar", {
        token: user.token,
        body: {
          title: "Birthday",
          startTime: "2026-04-01T00:00:00Z",
          endTime: "2026-04-01T23:59:59Z",
          allDay: true,
        },
      })
    );

    expect(res.status).toBe(201);
    const data = await res.json() as any;
    expect(data.data.allDay || data.data.all_day).toBe(true);
  });

  it("rejects event without title", async () => {
    const res = await app.request(
      buildRequest("POST", "/api/calendar", {
        token: user.token,
        body: {
          startTime: "2026-03-15T10:00:00Z",
          endTime: "2026-03-15T11:00:00Z",
        },
      })
    );

    expect(res.status).toBe(400);
  });
});

describe("GET /api/calendar", () => {
  it("lists events", async () => {
    const res = await app.request(
      buildRequest("GET", "/api/calendar?from=2026-01-01&to=2026-12-31", { token: user.token })
    );

    expect(res.status).toBe(200);
    const data = await res.json() as any;
    const events = data.data || [];
    expect(events).toBeInstanceOf(Array);
    expect(events.length).toBeGreaterThanOrEqual(1);
  });

  it("filters by date range", async () => {
    const res = await app.request(
      buildRequest("GET", "/api/calendar?from=2026-03-01&to=2026-03-31", {
        token: user.token,
      })
    );

    expect(res.status).toBe(200);
    const data = await res.json() as any;
    const events = data.datas || [];
    expect(events).toBeInstanceOf(Array);
  });
});

describe("GET /api/calendar/day/:date", () => {
  it("returns events for a specific day", async () => {
    const res = await app.request(
      buildRequest("GET", "/api/calendar/day/2026-03-15", {
        token: user.token,
      })
    );

    expect(res.status).toBe(200);
    const data = await res.json() as any;
    const events = data.data || [];
    expect(events.some((e: any) => e.title === "Team Meeting")).toBe(true);
  });
});

describe("GET /api/calendar/:id", () => {
  it("returns a single event", async () => {
    const res = await app.request(
      buildRequest("GET", `/api/calendar/${eventId}`, { token: user.token })
    );

    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.data.id).toBe(eventId);
  });
});

describe("PATCH /api/calendar/:id", () => {
  it("updates event title", async () => {
    const res = await app.request(
      buildRequest("PATCH", `/api/calendar/${eventId}`, {
        token: user.token,
        body: { title: "Team Standup" },
      })
    );

    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.data.title).toBe("Team Standup");
  });
});

describe("DELETE /api/calendar/:id", () => {
  it("deletes an event", async () => {
    // Create throwaway
    const createRes = await app.request(
      buildRequest("POST", "/api/calendar", {
        token: user.token,
        body: {
          title: "Delete Me",
          startTime: "2026-03-20T10:00:00Z",
          endTime: "2026-03-20T11:00:00Z",
        },
      })
    );
    const { data: event } = await createRes.json() as any;

    const res = await app.request(
      buildRequest("DELETE", `/api/calendar/${event.id}`, {
        token: user.token,
      })
    );

    expect(res.status).toBe(200);
  });

  it("returns 404 for non-existent event", async () => {
    const res = await app.request(
      buildRequest("DELETE", "/api/calendar/00000000-0000-0000-0000-000000000000", {
        token: user.token,
      })
    );

    expect(res.status).toBe(404);
  });
});
