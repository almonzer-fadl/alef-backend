/**
 * Books Test — uses /api/media with type "book"
 *
 * Books CRUD shares the unified media endpoints.
 * Search uses /api/books/search (Open Library proxy).
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { app } from "../src/index";
import { buildRequest, createTestUser, cleanupTestUser, type TestUser } from "./helpers";

let user: TestUser;
let bookId: string;

beforeAll(async () => {
  user = await createTestUser("books");
});

afterAll(async () => {
  await cleanupTestUser(user.id);
});

describe("POST /api/media (book)", () => {
  it("adds a book to reading list", async () => {
    const res = await app.request(
      buildRequest("POST", "/api/media", {
        token: user.token,
        body: {
          type: "book",
          title: "Atomic Habits",
          externalId: "OL12345W",
          posterUrl: "https://covers.openlibrary.org/b/olid/OL12345W-M.jpg",
          status: "watching",
        },
      })
    );

    expect(res.status).toBe(201);
    const data = await res.json() as any;
    expect(data.media.title).toBe("Atomic Habits");
    expect(data.media.type).toBe("book");
    bookId = data.media.id;
  });
});

describe("GET /api/media (books)", () => {
  it("lists books", async () => {
    const res = await app.request(
      buildRequest("GET", "/api/media?type=book", { token: user.token })
    );

    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.media).toBeInstanceOf(Array);
    expect(data.media.length).toBeGreaterThanOrEqual(1);
  });

  it("filters by status", async () => {
    const res = await app.request(
      buildRequest("GET", "/api/media?type=book&status=watching", {
        token: user.token,
      })
    );

    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.media.every((b: any) => b.status === "watching")).toBe(true);
  });
});

describe("PATCH /api/media/:id (book)", () => {
  it("updates reading progress", async () => {
    const res = await app.request(
      buildRequest("PATCH", `/api/media/${bookId}`, {
        token: user.token,
        body: { rating: 5, status: "completed" },
      })
    );

    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.media.rating).toBe(5);
  });
});

describe("DELETE /api/media/:id (book)", () => {
  it("removes a book", async () => {
    const res = await app.request(
      buildRequest("DELETE", `/api/media/${bookId}`, { token: user.token })
    );

    expect(res.status).toBe(200);
  });
});
