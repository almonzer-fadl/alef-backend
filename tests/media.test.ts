/**
 * Media Route Tests
 *
 * Tests movie/TV tracking and TMDB search proxy.
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { app } from "../src/index";
import { buildRequest, createTestUser, cleanupTestUser, type TestUser } from "./helpers";

let user: TestUser;
let mediaId: string;

beforeAll(async () => {
  user = await createTestUser("media");
});

afterAll(async () => {
  await cleanupTestUser(user.id);
});

describe("POST /api/media", () => {
  it("adds a movie to watchlist", async () => {
    const res = await app.request(
      buildRequest("POST", "/api/media", {
        token: user.token,
        body: {
          title: "Kingsman: The Secret Service",
          type: "movie",
          status: "completed",
          rating: 9,
          externalId: "207703",
          posterUrl: "https://image.tmdb.org/t/p/w500/test.jpg",
        },
      })
    );

    expect(res.status).toBe(201);
    const data = await res.json() as any;
    expect(data.media.title).toBe("Kingsman: The Secret Service");
    mediaId = data.media.id;
  });

  it("adds a TV show", async () => {
    const res = await app.request(
      buildRequest("POST", "/api/media", {
        token: user.token,
        body: {
          title: "Breaking Bad",
          type: "tv",
          status: "watching",
          progress: 60,
        },
      })
    );

    expect(res.status).toBe(201);
  });
});

describe("GET /api/media", () => {
  it("lists all media items", async () => {
    const res = await app.request(
      buildRequest("GET", "/api/media", { token: user.token })
    );

    expect(res.status).toBe(200);
    const data = await res.json() as any;
    const items = data.media;
    expect(items).toBeInstanceOf(Array);
    expect(items.length).toBeGreaterThanOrEqual(2);
  });

  it("filters by type", async () => {
    const res = await app.request(
      buildRequest("GET", "/api/media?type=movie", { token: user.token })
    );

    expect(res.status).toBe(200);
    const data = await res.json() as any;
    const items = data.media;
    for (const item of items) {
      expect(item.type).toBe("movie");
    }
  });

  it("filters by status", async () => {
    const res = await app.request(
      buildRequest("GET", "/api/media?status=watching", { token: user.token })
    );

    expect(res.status).toBe(200);
    const data = await res.json() as any;
    const items = data.media;
    for (const item of items) {
      expect(item.status).toBe("watching");
    }
  });
});

describe("GET /api/media/:id", () => {
  it("returns a single media item", async () => {
    const res = await app.request(
      buildRequest("GET", `/api/media/${mediaId}`, { token: user.token })
    );

    expect(res.status).toBe(200);
  });
});

describe("PATCH /api/media/:id", () => {
  it("updates rating", async () => {
    const res = await app.request(
      buildRequest("PATCH", `/api/media/${mediaId}`, {
        token: user.token,
        body: { rating: 10, review: "Manners maketh man." },
      })
    );

    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.media.rating).toBe(10);
  });

  it("changes status to completed", async () => {
    const res = await app.request(
      buildRequest("PATCH", `/api/media/${mediaId}`, {
        token: user.token,
        body: { status: "completed" },
      })
    );

    expect(res.status).toBe(200);
  });
});

describe("GET /api/media/search", () => {
  it("searches TMDB for movies", async () => {
    const res = await app.request(
      buildRequest("GET", "/api/media/search?q=Batman&type=movie", {
        token: user.token,
      })
    );

    // This hits the real TMDB API — might fail in CI without internet
    // Accept both 200 (success) and 502 (TMDB unreachable)
    expect([200, 502]).toContain(res.status);

    if (res.status === 200) {
      const data = await res.json() as any;
      expect(data.results).toBeInstanceOf(Array);
    }
  });
});

describe("DELETE /api/media/:id", () => {
  it("removes a media item", async () => {
    const res = await app.request(
      buildRequest("DELETE", `/api/media/${mediaId}`, { token: user.token })
    );

    expect(res.status).toBe(200);
  });
});
