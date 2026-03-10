/**
 * Media Module — Routes
 *
 * Unified tracking for movies, TV shows, books, and podcasts.
 * Integrates with TMDB API for movies/TV metadata and search.
 *
 * Routes:
 *   GET    /media          — list user's media items (filter by type/status)
 *   GET    /media/:id      — get a single media item
 *   POST   /media          — add a media item to collection
 *   PATCH  /media/:id      — update (change status, rating, review)
 *   DELETE /media/:id      — remove from collection
 *   GET    /media/search   — proxy search to TMDB API
 *
 * Search is proxied through the backend to keep the TMDB API key secure.
 * The iOS app should NEVER contain the API key.
 */

import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { db } from "../db";
import { mediaItems } from "../db/schema";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth } from "../middleware/auth";
import type { AuthEnv } from "../middleware/auth";

export const mediaRoutes = new Hono<AuthEnv>();

// All media routes require authentication
mediaRoutes.use("*", requireAuth);

// ─── Constants ───────────────────────────────────────────────────────

const TMDB_API_KEY = "f378002b4adfbf6c9f28dd61a2678a99";
const TMDB_BASE_URL = "https://api.themoviedb.org/3";
const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p/w500";

// ─── Validation Schemas ──────────────────────────────────────────────

const createMediaSchema = z.object({
  type: z.enum(["movie", "tv", "book", "podcast"]),
  status: z.enum(["watchlist", "watching", "completed", "dropped"]).optional(),
  title: z.string().min(1, "Title is required"),
  externalId: z.string().optional(),
  posterUrl: z.string().optional(),
  rating: z.number().int().min(1).max(10).optional(),
  review: z.string().optional(),
  progress: z.number().int().min(0).max(100).optional(),
  startedAt: z.string().optional(),
  completedAt: z.string().optional(),
});

const updateMediaSchema = createMediaSchema.partial();

// ─── GET /media — list all media items ───────────────────────────────

/**
 * Returns user's media collection, ordered by most recently updated.
 * Filter by type (movie/tv) and status (watchlist/watching/completed).
 * Default limit: 50 items.
 *
 * Query params:
 *   ?type=movie|tv      — filter by media type
 *   ?status=watchlist   — filter by status
 *   ?limit=50           — max number of items to return
 */
mediaRoutes.get("/", async (c) => {
  const userId = c.get("userId");
  const typeFilter = c.req.query("type") as "movie" | "tv" | "book" | "podcast" | undefined;
  const statusFilter = c.req.query("status") as "watchlist" | "watching" | "completed" | "dropped" | undefined;
  const limit = parseInt(c.req.query("limit") || "50");

  let query = db
    .select()
    .from(mediaItems)
    .where(eq(mediaItems.userId, userId))
    .orderBy(desc(mediaItems.updatedAt))
    .limit(limit);

  let result = await query;

  // Apply filters client-side (Drizzle doesn't support dynamic AND conditions elegantly)
  if (typeFilter) {
    result = result.filter((item) => item.type === typeFilter);
  }
  if (statusFilter) {
    result = result.filter((item) => item.status === statusFilter);
  }

  return c.json({ media: result });
});

// ─── GET /media/:id — get a single media item ────────────────────────

mediaRoutes.get("/:id", async (c) => {
  const userId = c.get("userId");
  const mediaId = c.req.param("id");

  const [item] = await db
    .select()
    .from(mediaItems)
    .where(and(eq(mediaItems.id, mediaId), eq(mediaItems.userId, userId)))
    .limit(1);

  if (!item) return c.json({ error: "Media item not found" }, 404);
  return c.json({ media: item });
});

// ─── POST /media — add a media item ──────────────────────────────────

mediaRoutes.post("/", zValidator("json", createMediaSchema), async (c) => {
  const userId = c.get("userId");
  const data = c.req.valid("json");

  const [item] = await db
    .insert(mediaItems)
    .values({
      userId,
      ...data,
      status: data.status || "watchlist",
    })
    .returning();

  return c.json({ media: item }, 201);
});

// ─── PATCH /media/:id — update a media item ──────────────────────────

mediaRoutes.patch("/:id", zValidator("json", updateMediaSchema), async (c) => {
  const userId = c.get("userId");
  const mediaId = c.req.param("id");
  const data = c.req.valid("json");

  const [item] = await db
    .update(mediaItems)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(mediaItems.id, mediaId), eq(mediaItems.userId, userId)))
    .returning();

  if (!item) return c.json({ error: "Media item not found" }, 404);
  return c.json({ media: item });
});

// ─── DELETE /media/:id — remove from collection ──────────────────────

mediaRoutes.delete("/:id", async (c) => {
  const userId = c.get("userId");
  const mediaId = c.req.param("id");

  const [deleted] = await db
    .delete(mediaItems)
    .where(and(eq(mediaItems.id, mediaId), eq(mediaItems.userId, userId)))
    .returning();

  if (!deleted) return c.json({ error: "Media item not found" }, 404);
  return c.json({ message: "Media item removed" });
});

// ─── GET /media/search — TMDB search proxy ───────────────────────────

/**
 * Proxies search requests to TMDB API (movies or TV shows).
 * Keeps the API key secure on the backend.
 *
 * Query params:
 *   ?q=batman         — search query (required)
 *   ?type=movie|tv    — media type (required)
 *
 * Returns simplified results with:
 *   - tmdbId (original TMDB ID)
 *   - title
 *   - posterUrl (full URL with TMDB image base)
 *   - year (extracted from release_date or first_air_date)
 *   - overview
 */
mediaRoutes.get("/search", async (c) => {
  const query = c.req.query("q");
  const type = c.req.query("type") as "movie" | "tv" | undefined;

  if (!query) {
    return c.json({ error: "Search query (?q=) is required" }, 400);
  }

  if (!type || !["movie", "tv"].includes(type)) {
    return c.json({ error: "Valid type (?type=movie|tv) is required" }, 400);
  }

  // Build TMDB search URL
  const endpoint = type === "movie" ? "search/movie" : "search/tv";
  const tmdbUrl = `${TMDB_BASE_URL}/${endpoint}?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}`;

  try {
    const response = await fetch(tmdbUrl);
    if (!response.ok) {
      return c.json({ error: "TMDB API request failed" }, 502);
    }

    const data = await response.json() as {
      results: Array<{
        id: number;
        title?: string;
        name?: string;
        poster_path?: string;
        release_date?: string;
        first_air_date?: string;
        overview?: string;
      }>;
    };

    // Transform TMDB results into our simplified format
    const results = data.results.map((item) => ({
      tmdbId: item.id,
      title: item.title || item.name || "Untitled",
      posterUrl: item.poster_path ? `${TMDB_IMAGE_BASE}${item.poster_path}` : null,
      year: extractYear(item.release_date || item.first_air_date),
      overview: item.overview || "",
    }));

    return c.json({ results });
  } catch (error) {
    console.error("TMDB search error:", error);
    return c.json({ error: "Failed to fetch search results" }, 500);
  }
});

// ─── Helpers ─────────────────────────────────────────────────────────

function extractYear(dateString: string | undefined): string | null {
  if (!dateString) return null;
  return dateString.split("-")[0] || null;
}
