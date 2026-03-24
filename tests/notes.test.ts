/**
 * Notes Route Tests
 *
 * Tests note CRUD, folder management, pinning, search.
 * Note: This route returns raw objects, not wrapped in { note: ... }
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { app } from "../src/index";
import { buildRequest, createTestUser, cleanupTestUser, type TestUser } from "./helpers";

let user: TestUser;
let noteId: string;
let folderId: string;

beforeAll(async () => {
  user = await createTestUser("notes");
});

afterAll(async () => {
  await cleanupTestUser(user.id);
});

// ─── Folders ─────────────────────────────────────────────────────────

describe("POST /api/notes/folders", () => {
  it("creates a folder", async () => {
    const res = await app.request(
      buildRequest("POST", "/api/notes/folders", {
        token: user.token,
        body: { name: "Work", icon: "briefcase.fill", color: "#22D3EE" },
      })
    );

    expect(res.status).toBe(201);
    const data = await res.json() as any;
    // Route returns raw object: { id, name, icon, color, ... }
    expect(data.name).toBe("Work");
    folderId = data.id;
  });
});

describe("GET /api/notes/folders", () => {
  it("lists folders", async () => {
    const res = await app.request(
      buildRequest("GET", "/api/notes/folders", { token: user.token })
    );

    expect(res.status).toBe(200);
    const data = await res.json() as any;
    // Route returns array directly
    expect(data).toBeInstanceOf(Array);
    expect(data.length).toBeGreaterThanOrEqual(1);
  });
});

// ─── Notes ───────────────────────────────────────────────────────────

describe("POST /api/notes", () => {
  it("creates a note in a folder", async () => {
    const res = await app.request(
      buildRequest("POST", "/api/notes", {
        token: user.token,
        body: {
          title: "Meeting Notes",
          content: "Discussed the roadmap for Q2.",
          folderId: folderId,
        },
      })
    );

    expect(res.status).toBe(201);
    const data = await res.json() as any;
    expect(data.title).toBe("Meeting Notes");
    noteId = data.id;
  });

  it("creates a note without folder", async () => {
    const res = await app.request(
      buildRequest("POST", "/api/notes", {
        token: user.token,
        body: {
          title: "Quick Thought",
          content: "Something interesting to remember.",
        },
      })
    );

    expect(res.status).toBe(201);
  });

  it("rejects note without title", async () => {
    const res = await app.request(
      buildRequest("POST", "/api/notes", {
        token: user.token,
        body: { content: "No title" },
      })
    );

    expect(res.status).toBe(400);
  });
});

describe("GET /api/notes", () => {
  it("lists all notes", async () => {
    const res = await app.request(
      buildRequest("GET", "/api/notes", { token: user.token })
    );

    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data).toBeInstanceOf(Array);
    expect(data.length).toBeGreaterThanOrEqual(2);
  });

  it("filters by folder", async () => {
    const res = await app.request(
      buildRequest("GET", `/api/notes?folderId=${folderId}`, {
        token: user.token,
      })
    );

    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data).toBeInstanceOf(Array);
    expect(data.length).toBeGreaterThanOrEqual(1);
  });
});

describe("GET /api/notes/:id", () => {
  it("returns a single note", async () => {
    const res = await app.request(
      buildRequest("GET", `/api/notes/${noteId}`, { token: user.token })
    );

    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.id).toBe(noteId);
  });
});

describe("GET /api/notes/search", () => {
  it("searches notes by content", async () => {
    const res = await app.request(
      buildRequest("GET", "/api/notes/search?q=roadmap", { token: user.token })
    );

    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data).toBeInstanceOf(Array);
    expect(data.length).toBeGreaterThanOrEqual(1);
  });

  it("returns empty for no matches", async () => {
    const res = await app.request(
      buildRequest("GET", "/api/notes/search?q=xyznonexistent", {
        token: user.token,
      })
    );

    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.length).toBe(0);
  });
});

describe("PATCH /api/notes/:id", () => {
  it("updates note content", async () => {
    const res = await app.request(
      buildRequest("PATCH", `/api/notes/${noteId}`, {
        token: user.token,
        body: { content: "Updated roadmap discussion." },
      })
    );

    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.content).toContain("Updated");
  });

  it("pins a note", async () => {
    const res = await app.request(
      buildRequest("PATCH", `/api/notes/${noteId}`, {
        token: user.token,
        body: { isPinned: true },
      })
    );

    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.isPinned).toBe(true);
  });
});

describe("DELETE /api/notes/:id", () => {
  it("deletes a note", async () => {
    const createRes = await app.request(
      buildRequest("POST", "/api/notes", {
        token: user.token,
        body: { title: "Delete Me", content: "Bye" },
      })
    );
    const created = await createRes.json() as any;

    const res = await app.request(
      buildRequest("DELETE", `/api/notes/${created.id}`, { token: user.token })
    );

    expect(res.status).toBe(200);
  });
});

describe("DELETE /api/notes/folders/:id", () => {
  it("deletes a folder", async () => {
    const fRes = await app.request(
      buildRequest("POST", "/api/notes/folders", {
        token: user.token,
        body: { name: "Temp Folder" },
      })
    );
    const folder = await fRes.json() as any;

    const res = await app.request(
      buildRequest("DELETE", `/api/notes/folders/${folder.id}`, {
        token: user.token,
      })
    );

    expect(res.status).toBe(200);
  });
});
