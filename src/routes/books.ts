/**
 * Books Module — Search Routes
 *
 * Provides Open Library search for the Books module.
 * The actual book CRUD uses the unified /api/media endpoints
 * with type: "book".
 *
 * Routes:
 *   GET /books/search — search Open Library for books
 *
 * Open Library API:
 *   Search: https://openlibrary.org/search.json?q=query&limit=10
 *   Covers: https://covers.openlibrary.org/b/olid/{OLID}-M.jpg (M=medium, L=large)
 *           https://covers.openlibrary.org/b/isbn/{ISBN}-M.jpg
 */

import { Hono } from "hono";
import { requireAuth } from "../middleware/auth";
import type { AuthEnv } from "../middleware/auth";

export const bookRoutes = new Hono<AuthEnv>();

// All book routes require authentication
bookRoutes.use("*", requireAuth);

// ─── Constants ───────────────────────────────────────────────────────

const OPEN_LIBRARY_SEARCH = "https://openlibrary.org/search.json";
const OPEN_LIBRARY_COVERS = "https://covers.openlibrary.org/b/olid";

// ─── GET /books/search — Open Library search ────────────────────────

/**
 * Proxies search requests to Open Library API.
 *
 * Query params:
 *   ?q=atomic habits  — search query (required)
 *
 * Returns simplified results with:
 *   - olid (Open Library ID for the edition)
 *   - title
 *   - author
 *   - year (first publish year)
 *   - coverUrl (Open Library cover image URL)
 *   - isbn (first ISBN if available)
 */
bookRoutes.get("/search", async (c) => {
  const query = c.req.query("q");

  if (!query) {
    return c.json({ error: "Search query (?q=) is required" }, 400);
  }

  try {
    const url = `${OPEN_LIBRARY_SEARCH}?q=${encodeURIComponent(query)}&limit=10`;
    const response = await fetch(url);

    if (!response.ok) {
      return c.json({ error: "Open Library API request failed" }, 502);
    }

    const data = await response.json() as {
      docs: Array<{
        key?: string;
        title?: string;
        author_name?: string[];
        first_publish_year?: number;
        edition_key?: string[];
        isbn?: string[];
        cover_edition_key?: string;
      }>;
    };

    // Transform Open Library results into our format
    const results = data.docs.map((doc) => {
      // Use cover_edition_key or first edition_key as OLID
      const olid = doc.cover_edition_key || (doc.edition_key?.[0]);
      const isbn = doc.isbn?.[0];

      return {
        olid: olid || null,
        title: doc.title || "Untitled",
        author: doc.author_name?.[0] || "Unknown Author",
        year: doc.first_publish_year || null,
        coverUrl: olid ? `${OPEN_LIBRARY_COVERS}/${olid}-M.jpg` : null,
        isbn: isbn || null,
      };
    });

    return c.json({ results });
  } catch (error) {
    console.error("Open Library search error:", error);
    return c.json({ error: "Failed to fetch search results" }, 500);
  }
});
