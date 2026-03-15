/**
 * Notes API Routes
 * 
 * Provides CRUD operations for notes and folders.
 * All routes require authentication via JWT middleware.
 */

import { Hono } from "hono";
import { db } from "../db";
import { notes, noteFolders } from "../db/schema";
import { eq, and, desc, or, ilike, sql } from "drizzle-orm";
import { requireAuth } from "../middleware/auth";

const app = new Hono();

// Apply auth middleware to all routes
app.use("/*", requireAuth);

// ─────────────────────────────────────────────────────────────────────
// Folders CRUD
// ─────────────────────────────────────────────────────────────────────

/**
 * GET /notes/folders
 * List all folders for the current user
 */
app.get("/folders", async (c) => {
  const userId = c.get("userId");

  const result = await db
    .select({
      id: noteFolders.id,
      userId: noteFolders.userId,
      name: noteFolders.name,
      icon: noteFolders.icon,
      color: noteFolders.color,
      sortOrder: noteFolders.sortOrder,
      createdAt: noteFolders.createdAt,
      noteCount: sql<number>`(
        SELECT COUNT(*)::int 
        FROM ${notes} 
        WHERE ${notes.folderId} = ${noteFolders.id} 
        AND ${notes.isArchived} = false
      )`,
    })
    .from(noteFolders)
    .where(eq(noteFolders.userId, userId))
    .orderBy(noteFolders.sortOrder);

  return c.json(result);
});

/**
 * POST /notes/folders
 * Create a new folder
 * Body: { name, icon?, color?, sortOrder? }
 */
app.post("/folders", async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json();

  const { name, icon, color, sortOrder } = body;

  if (!name) {
    return c.json({ error: "Name is required" }, 400);
  }

  const result = await db
    .insert(noteFolders)
    .values({
      userId,
      name,
      icon: icon || "folder.fill",
      color: color || "#FBBF24",
      sortOrder: sortOrder || 0,
    })
    .returning();

  return c.json(result[0], 201);
});

/**
 * PATCH /notes/folders/:id
 * Update a folder
 * Body: { name?, icon?, color?, sortOrder? }
 */
app.patch("/folders/:id", async (c) => {
  const userId = c.get("userId");
  const folderId = c.req.param("id");
  const body = await c.req.json();

  const { name, icon, color, sortOrder } = body;

  const updateData: any = {};

  if (name !== undefined) updateData.name = name;
  if (icon !== undefined) updateData.icon = icon;
  if (color !== undefined) updateData.color = color;
  if (sortOrder !== undefined) updateData.sortOrder = sortOrder;

  const result = await db
    .update(noteFolders)
    .set(updateData)
    .where(and(eq(noteFolders.id, folderId), eq(noteFolders.userId, userId)))
    .returning();

  if (result.length === 0) {
    return c.json({ error: "Folder not found" }, 404);
  }

  return c.json(result[0]);
});

/**
 * DELETE /notes/folders/:id
 * Delete a folder (notes inside become unfiled, not deleted)
 */
app.delete("/folders/:id", async (c) => {
  const userId = c.get("userId");
  const folderId = c.req.param("id");

  const result = await db
    .delete(noteFolders)
    .where(and(eq(noteFolders.id, folderId), eq(noteFolders.userId, userId)))
    .returning();

  if (result.length === 0) {
    return c.json({ error: "Folder not found" }, 404);
  }

  return c.json({ success: true });
});

// ─────────────────────────────────────────────────────────────────────
// Notes CRUD
// ─────────────────────────────────────────────────────────────────────

/**
 * GET /notes
 * List notes with optional filters
 * Query params:
 *   - folderId: filter by folder UUID
 *   - pinned: true/false
 *   - archived: true/false (default: false)
 */
app.get("/", async (c) => {
  const userId = c.get("userId");
  const { folderId, pinned, archived } = c.req.query();

  const conditions = [eq(notes.userId, userId)];

  if (folderId) {
    conditions.push(eq(notes.folderId, folderId));
  }

  if (pinned !== undefined) {
    conditions.push(eq(notes.isPinned, pinned === "true"));
  }

  // Default: hide archived notes unless explicitly requested
  if (archived === "true") {
    conditions.push(eq(notes.isArchived, true));
  } else {
    conditions.push(eq(notes.isArchived, false));
  }

  const result = await db
    .select()
    .from(notes)
    .where(and(...conditions))
    .orderBy(desc(notes.isPinned), desc(notes.updatedAt));

  return c.json(result);
});

/**
 * GET /notes/search?q=query
 * Full-text search in title and content
 */
app.get("/search", async (c) => {
  const userId = c.get("userId");
  const query = c.req.query("q");

  if (!query) {
    return c.json({ error: "Query parameter 'q' is required" }, 400);
  }

  const searchPattern = `%${query}%`;

  const result = await db
    .select()
    .from(notes)
    .where(
      and(
        eq(notes.userId, userId),
        eq(notes.isArchived, false),
        or(
          ilike(notes.title, searchPattern),
          ilike(notes.content, searchPattern)
        )
      )
    )
    .orderBy(desc(notes.updatedAt));

  return c.json(result);
});

/**
 * GET /notes/:id
 * Get a single note by ID
 */
app.get("/:id", async (c) => {
  const userId = c.get("userId");
  const noteId = c.req.param("id");

  const result = await db
    .select()
    .from(notes)
    .where(and(eq(notes.id, noteId), eq(notes.userId, userId)))
    .limit(1);

  if (result.length === 0) {
    return c.json({ error: "Note not found" }, 404);
  }

  return c.json(result[0]);
});

/**
 * POST /notes
 * Create a new note
 * Body: { title, content?, folderId?, isPinned?, tags? }
 */
app.post("/", async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json();

  const { title, content, folderId, isPinned, tags } = body;

  if (!title) {
    return c.json({ error: "Title is required" }, 400);
  }

  const result = await db
    .insert(notes)
    .values({
      userId,
      title,
      content: content || null,
      folderId: folderId || null,
      isPinned: isPinned || false,
      isArchived: false,
      tags: tags || null,
    })
    .returning();

  return c.json(result[0], 201);
});

/**
 * PATCH /notes/:id
 * Update an existing note
 * Body: { title?, content?, folderId?, isPinned?, isArchived?, tags? }
 */
app.patch("/:id", async (c) => {
  const userId = c.get("userId");
  const noteId = c.req.param("id");
  const body = await c.req.json();

  const { title, content, folderId, isPinned, isArchived, tags } = body;

  const updateData: any = {
    updatedAt: new Date(),
  };

  if (title !== undefined) updateData.title = title;
  if (content !== undefined) updateData.content = content;
  if (folderId !== undefined) updateData.folderId = folderId;
  if (isPinned !== undefined) updateData.isPinned = isPinned;
  if (isArchived !== undefined) updateData.isArchived = isArchived;
  if (tags !== undefined) updateData.tags = tags;

  const result = await db
    .update(notes)
    .set(updateData)
    .where(and(eq(notes.id, noteId), eq(notes.userId, userId)))
    .returning();

  if (result.length === 0) {
    return c.json({ error: "Note not found" }, 404);
  }

  return c.json(result[0]);
});

/**
 * DELETE /notes/:id
 * Delete a note permanently
 */
app.delete("/:id", async (c) => {
  const userId = c.get("userId");
  const noteId = c.req.param("id");

  const result = await db
    .delete(notes)
    .where(and(eq(notes.id, noteId), eq(notes.userId, userId)))
    .returning();

  if (result.length === 0) {
    return c.json({ error: "Note not found" }, 404);
  }

  return c.json({ success: true });
});

export default app;
