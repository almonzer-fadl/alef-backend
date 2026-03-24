/**
 * Projects Module — Routes
 *
 * ClickUp-inspired project & task management for Alef.
 * Projects are containers for tasks, displayed as kanban boards.
 * Tasks can also exist independently (personal todos).
 *
 * Routes:
 *   GET    /projects           — list user's projects
 *   GET    /projects/:id       — single project with task counts
 *   POST   /projects           — create project
 *   PATCH  /projects/:id       — update project
 *   DELETE /projects/:id       — delete project (cascades tasks)
 *   GET    /projects/:id/tasks — list tasks in a project
 *   GET    /tasks              — list all tasks (filterable)
 *   POST   /tasks              — create task
 *   PATCH  /tasks/:id          — update task
 *   DELETE /tasks/:id          — delete task
 */

import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { db } from "../db";
import { projects, tasks } from "../db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { requireAuth } from "../middleware/auth";
import type { AuthEnv } from "../middleware/auth";

export const projectRoutes = new Hono<AuthEnv>();

// All project routes require authentication
projectRoutes.use("*", requireAuth);

// ─── Validation Schemas ──────────────────────────────────────────────

const createProjectSchema = z.object({
  name: z.string().min(1, "Project name is required"),
  description: z.string().optional(),
  color: z.string().optional(),               // hex colour
  icon: z.string().optional(),                // SF Symbol name
  status: z.enum(["active", "on_hold", "completed", "archived"]).optional(),
  sort_order: z.number().int().optional(),
});

const updateProjectSchema = createProjectSchema.partial();

const createTaskSchema = z.object({
  title: z.string().min(1, "Task title is required"),
  description: z.string().optional(),
  project_id: z.string().uuid().optional(),
  status: z.enum(["todo", "in_progress", "review", "done"]).optional(),
  priority: z.enum(["urgent", "high", "medium", "low", "none"]).optional(),
  due_date: z.string().optional(),             // "YYYY-MM-DD"
  tags: z.array(z.string()).optional(),
  sort_order: z.number().int().optional(),
});

const updateTaskSchema = createTaskSchema.partial();

// ─── Helper: Convert snake_case API data to camelCase for Drizzle ────

function toCamelCase(data: any): any {
  const result: any = {};
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) {
      // Convert snake_case to camelCase
      const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
      result[camelKey] = value;
    }
  }
  return result;
}

// ─── GET /projects — list user's projects ────────────────────────────

/**
 * Returns all projects owned by the authenticated user.
 * Query params:
 *   ?status=active       — filter by status
 *   ?includeArchived=true — include archived projects
 */
projectRoutes.get("/", async (c) => {
  const userId = c.get("userId");
  const statusFilter = c.req.query("status");
  const includeArchived = c.req.query("includeArchived") === "true";

  let query = db
    .select({
      id: projects.id,
      userId: projects.userId,
      name: projects.name,
      description: projects.description,
      color: projects.color,
      icon: projects.icon,
      status: projects.status,
      sortOrder: projects.sortOrder,
      createdAt: projects.createdAt,
      updatedAt: projects.updatedAt,
      taskCount: sql<number>`count(${tasks.id})::int`,
    })
    .from(projects)
    .leftJoin(tasks, eq(tasks.projectId, projects.id))
    .where(eq(projects.userId, userId))
    .groupBy(projects.id)
    .orderBy(projects.sortOrder);

  const result = await query;

  // Filter client-side for status/archived
  let filtered = result;
  if (statusFilter) {
    filtered = filtered.filter((p) => p.status === statusFilter);
  }
  if (!includeArchived) {
    filtered = filtered.filter((p) => p.status !== "archived");
  }

  return c.json({ projects: filtered });
});

// ─── GET /tasks — list all tasks (must be before /:id) ───────────────

/**
 * Returns tasks for the authenticated user.
 * Query params:
 *   ?status=todo          — filter by status
 *   ?priority=urgent      — filter by priority
 *   ?projectId=xxx        — filter by project
 *   ?noProject=true       — only tasks without a project
 */
projectRoutes.get("/tasks", async (c) => {
  const userId = c.get("userId");
  const statusFilter = c.req.query("status");
  const priorityFilter = c.req.query("priority");
  const projectIdFilter = c.req.query("projectId");
  const noProject = c.req.query("noProject") === "true";

  let query = db
    .select()
    .from(tasks)
    .where(eq(tasks.userId, userId))
    .orderBy(tasks.sortOrder, desc(tasks.createdAt));

  const result = await query;

  let filtered = result;

  if (statusFilter) {
    filtered = filtered.filter((t) => t.status === statusFilter);
  }
  if (priorityFilter) {
    filtered = filtered.filter((t) => t.priority === priorityFilter);
  }
  if (projectIdFilter) {
    filtered = filtered.filter((t) => t.projectId === projectIdFilter);
  }
  if (noProject) {
    filtered = filtered.filter((t) => !t.projectId);
  }

  return c.json({ tasks: filtered });
});

// ─── GET /projects/:id — single project with task counts ─────────────

/**
 * Returns a single project with task statistics.
 * Includes counts for each task status (todo, in_progress, review, done).
 */
projectRoutes.get("/:id", async (c) => {
  const userId = c.get("userId");
  const projectId = c.req.param("id");

  const [project] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
    .limit(1);

  if (!project) return c.json({ error: "Project not found" }, 404);

  // Get task counts by status
  const taskStats = await db
    .select({
      status: tasks.status,
      count: sql<number>`count(*)::int`,
    })
    .from(tasks)
    .where(and(eq(tasks.projectId, projectId), eq(tasks.userId, userId)))
    .groupBy(tasks.status);

  const stats = {
    todo: 0,
    in_progress: 0,
    review: 0,
    done: 0,
  };

  taskStats.forEach((s) => {
    stats[s.status as keyof typeof stats] = s.count;
  });

  return c.json({
    project,
    taskCounts: stats,
    totalTasks: Object.values(stats).reduce((a, b) => a + b, 0),
  });
});

// ─── POST /projects — create project ─────────────────────────────────

projectRoutes.post("/", zValidator("json", createProjectSchema), async (c) => {
  const userId = c.get("userId");
  const data = c.req.valid("json");

  const [project] = await db
    .insert(projects)
    .values({ userId, ...toCamelCase(data) })
    .returning();

  return c.json({ project }, 201);
});

// ─── PATCH /projects/:id — update project ────────────────────────────

projectRoutes.patch("/:id", zValidator("json", updateProjectSchema), async (c) => {
  const userId = c.get("userId");
  const projectId = c.req.param("id");
  const data = c.req.valid("json");

  const [project] = await db
    .update(projects)
    .set({ ...toCamelCase(data), updatedAt: new Date() })
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
    .returning();

  if (!project) return c.json({ error: "Project not found" }, 404);
  return c.json({ project });
});

// ─── DELETE /projects/:id — delete project ───────────────────────────

/**
 * Permanently deletes a project and all its tasks (cascade).
 * Consider archiving instead: PATCH /projects/:id { status: "archived" }
 */
projectRoutes.delete("/:id", async (c) => {
  const userId = c.get("userId");
  const projectId = c.req.param("id");

  const [deleted] = await db
    .delete(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
    .returning();

  if (!deleted) return c.json({ error: "Project not found" }, 404);
  return c.json({ message: "Project deleted" });
});

// ─── GET /projects/:id/tasks — list tasks in a project ───────────────

/**
 * Returns all tasks belonging to a specific project.
 * Tasks are grouped by status for the kanban board view.
 */
projectRoutes.get("/:id/tasks", async (c) => {
  const userId = c.get("userId");
  const projectId = c.req.param("id");

  // Verify project ownership
  const [project] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
    .limit(1);

  if (!project) return c.json({ error: "Project not found" }, 404);

  const projectTasks = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.projectId, projectId), eq(tasks.userId, userId)))
    .orderBy(tasks.sortOrder, desc(tasks.createdAt));

  return c.json({ tasks: projectTasks });
});

// ─── GET /tasks — list all tasks (filterable) ────────────────────────

// ─── POST /tasks — create task ───────────────────────────────────────

projectRoutes.post("/tasks", zValidator("json", createTaskSchema), async (c) => {
  const userId = c.get("userId");
  const data = c.req.valid("json");
  const camelData = toCamelCase(data);

  // If projectId is provided, verify ownership
  if (camelData.projectId) {
    const [project] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, camelData.projectId), eq(projects.userId, userId)))
      .limit(1);

    if (!project) return c.json({ error: "Project not found" }, 404);
  }

  const [task] = await db
    .insert(tasks)
    .values({ userId, ...camelData })
    .returning();

  return c.json({ task }, 201);
});

// ─── PATCH /tasks/:id — update task ──────────────────────────────────

projectRoutes.patch("/tasks/:id", zValidator("json", updateTaskSchema), async (c) => {
  const userId = c.get("userId");
  const taskId = c.req.param("id");
  const data = c.req.valid("json");

  // Auto-set completedAt when status changes to "done"
  const updateData: any = { ...toCamelCase(data), updatedAt: new Date() };
  if (data.status === "done") {
    updateData.completedAt = new Date();
  } else if (data.status && data.status !== "done") {
    updateData.completedAt = null;
  }

  const [task] = await db
    .update(tasks)
    .set(updateData)
    .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)))
    .returning();

  if (!task) return c.json({ error: "Task not found" }, 404);
  return c.json({ task });
});

// ─── DELETE /tasks/:id — delete task ─────────────────────────────────

projectRoutes.delete("/tasks/:id", async (c) => {
  const userId = c.get("userId");
  const taskId = c.req.param("id");

  const [deleted] = await db
    .delete(tasks)
    .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)))
    .returning();

  if (!deleted) return c.json({ error: "Task not found" }, 404);
  return c.json({ message: "Task deleted" });
});
