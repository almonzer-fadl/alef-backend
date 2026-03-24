/**
 * Reminders Route Tests
 *
 * Tests reminder CRUD, lists, smart lists, priorities, flagging.
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { app } from "../src/index";
import { buildRequest, createTestUser, cleanupTestUser, type TestUser } from "./helpers";

let user: TestUser;
let listId: string;
let reminderId: string;

beforeAll(async () => {
  user = await createTestUser("reminders");
});

afterAll(async () => {
  await cleanupTestUser(user.id);
});

// ─── Lists ───────────────────────────────────────────────────────────

describe("POST /api/reminders/lists", () => {
  it("creates a reminder list", async () => {
    const res = await app.request(
      buildRequest("POST", "/api/reminders/lists", {
        token: user.token,
        body: { name: "Shopping", icon: "cart.fill", color: "#FB923C" },
      })
    );

    expect(res.status).toBe(201);
    const data = await res.json() as any;
    expect(data.list.name).toBe("Shopping");
    listId = data.list.id;
  });
});

describe("GET /api/reminders/lists", () => {
  it("lists all reminder lists", async () => {
    const res = await app.request(
      buildRequest("GET", "/api/reminders/lists", { token: user.token })
    );

    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.lists).toBeInstanceOf(Array);
    expect(data.lists.length).toBeGreaterThanOrEqual(1);
  });
});

// ─── Reminders ───────────────────────────────────────────────────────

describe("POST /api/reminders", () => {
  it("creates a reminder in a list", async () => {
    const res = await app.request(
      buildRequest("POST", "/api/reminders", {
        token: user.token,
        body: {
          title: "Buy milk",
          listId: listId,
          priority: 2,
          dueDate: "2026-03-15",
        },
      })
    );

    expect(res.status).toBe(201);
    const data = await res.json() as any;
    expect(data.reminder.title).toBe("Buy milk");
    reminderId = data.reminder.id;
  });

  it("creates a flagged reminder", async () => {
    const res = await app.request(
      buildRequest("POST", "/api/reminders", {
        token: user.token,
        body: {
          title: "Important meeting",
          flagged: true,
          priority: 3,
        },
      })
    );

    expect(res.status).toBe(201);
    const data = await res.json() as any;
    expect(data.reminder.flagged).toBe(true);
  });

  it("creates a recurring reminder", async () => {
    const res = await app.request(
      buildRequest("POST", "/api/reminders", {
        token: user.token,
        body: {
          title: "Weekly review",
          recurrence: "weekly",
          dueDate: "2026-03-10",
        },
      })
    );

    expect(res.status).toBe(201);
    const data = await res.json() as any;
    expect(data.reminder.recurrence).toBe("weekly");
  });

  it("rejects reminder without title", async () => {
    const res = await app.request(
      buildRequest("POST", "/api/reminders", {
        token: user.token,
        body: { priority: 1 },
      })
    );

    expect(res.status).toBe(400);
  });
});

describe("GET /api/reminders", () => {
  it("lists all reminders", async () => {
    const res = await app.request(
      buildRequest("GET", "/api/reminders", { token: user.token })
    );

    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.reminders).toBeInstanceOf(Array);
    expect(data.reminders.length).toBeGreaterThanOrEqual(3);
  });

  it("filters by list", async () => {
    const res = await app.request(
      buildRequest("GET", `/api/reminders?listId=${listId}`, {
        token: user.token,
      })
    );

    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.reminders.length).toBeGreaterThanOrEqual(1);
  });

  it("filters flagged reminders", async () => {
    const res = await app.request(
      buildRequest("GET", "/api/reminders?flagged=true", { token: user.token })
    );

    expect(res.status).toBe(200);
    const data = await res.json() as any;
    for (const r of data.reminders) {
      expect(r.flagged).toBe(true);
    }
  });
});

describe("GET /api/reminders/:id", () => {
  it("returns a single reminder", async () => {
    const res = await app.request(
      buildRequest("GET", `/api/reminders/${reminderId}`, {
        token: user.token,
      })
    );

    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.reminder.id).toBe(reminderId);
  });
});

describe("PATCH /api/reminders/:id", () => {
  it("marks reminder as completed", async () => {
    const res = await app.request(
      buildRequest("PATCH", `/api/reminders/${reminderId}`, {
        token: user.token,
        body: { isCompleted: true },
      })
    );

    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.reminder.isCompleted).toBe(true);
  });

  it("updates title and priority", async () => {
    const res = await app.request(
      buildRequest("PATCH", `/api/reminders/${reminderId}`, {
        token: user.token,
        body: { title: "Buy oat milk", priority: 3 },
      })
    );

    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.reminder.title).toBe("Buy oat milk");
  });
});

describe("DELETE /api/reminders/:id", () => {
  it("deletes a reminder", async () => {
    const res = await app.request(
      buildRequest("DELETE", `/api/reminders/${reminderId}`, {
        token: user.token,
      })
    );

    expect(res.status).toBe(200);
  });

  it("returns 404 for non-existent reminder", async () => {
    const res = await app.request(
      buildRequest("DELETE", "/api/reminders/00000000-0000-0000-0000-000000000000", {
        token: user.token,
      })
    );

    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/reminders/lists/:id", () => {
  it("deletes a list", async () => {
    const fRes = await app.request(
      buildRequest("POST", "/api/reminders/lists", {
        token: user.token,
        body: { name: "Temp List" },
      })
    );
    const { list } = await fRes.json() as any;

    const res = await app.request(
      buildRequest("DELETE", `/api/reminders/lists/${list.id}`, {
        token: user.token,
      })
    );

    expect(res.status).toBe(200);
  });
});
