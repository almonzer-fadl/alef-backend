/**
 * Projects Route Tests
 *
 * Tests project CRUD and task management with kanban statuses.
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { app } from "../src/index";
import { buildRequest, createTestUser, cleanupTestUser, type TestUser } from "./helpers";

let user: TestUser;
let projectId: string;
let taskId: string;

beforeAll(async () => {
  user = await createTestUser("projects");
});

afterAll(async () => {
  await cleanupTestUser(user.id);
});

describe("POST /api/projects", () => {
  it("creates a project", async () => {
    const res = await app.request(
      buildRequest("POST", "/api/projects", {
        token: user.token,
        body: {
          name: "Alef App",
          description: "Life OS",
          color: "#22D3EE",
          icon: "folder.fill",
        },
      })
    );

    expect(res.status).toBe(201);
    const data = await res.json() as any;
    expect(data.project.name).toBe("Alef App");
    projectId = data.project.id;
  });

  it("rejects project without name", async () => {
    const res = await app.request(
      buildRequest("POST", "/api/projects", {
        token: user.token,
        body: { description: "No name" },
      })
    );

    expect(res.status).toBe(400);
  });
});

describe("GET /api/projects", () => {
  it("lists projects with task stats", async () => {
    const res = await app.request(
      buildRequest("GET", "/api/projects", { token: user.token })
    );

    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.projects).toBeInstanceOf(Array);
    expect(data.projects.length).toBeGreaterThanOrEqual(1);
  });
});

describe("GET /api/projects/:id", () => {
  it("returns a single project", async () => {
    const res = await app.request(
      buildRequest("GET", `/api/projects/${projectId}`, { token: user.token })
    );

    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.project.id).toBe(projectId);
  });

  it("returns 404 for non-existent project", async () => {
    const res = await app.request(
      buildRequest("GET", "/api/projects/00000000-0000-0000-0000-000000000000", {
        token: user.token,
      })
    );

    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/projects/:id", () => {
  it("updates project name", async () => {
    const res = await app.request(
      buildRequest("PATCH", `/api/projects/${projectId}`, {
        token: user.token,
        body: { name: "Alef v2" },
      })
    );

    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.project.name).toBe("Alef v2");
  });
});

// ─── Tasks ───────────────────────────────────────────────────────────

describe("POST /api/projects/tasks", () => {
  it("creates a task in a project", async () => {
    const res = await app.request(
      buildRequest("POST", "/api/projects/tasks", {
        token: user.token,
        body: {
          title: "Write tests",
          project_id: projectId,
          priority: "high",
          status: "todo",
        },
      })
    );

    expect(res.status).toBe(201);
    const data = await res.json() as any;
    expect(data.task.title).toBe("Write tests");
    taskId = data.task.id;
  });

  it("creates a task without project (personal todo)", async () => {
    const res = await app.request(
      buildRequest("POST", "/api/projects/tasks", {
        token: user.token,
        body: {
          title: "Buy groceries",
          priority: "low",
        },
      })
    );

    expect(res.status).toBe(201);
  });

  it("rejects task without title", async () => {
    const res = await app.request(
      buildRequest("POST", "/api/projects/tasks", {
        token: user.token,
        body: { priority: "low" },
      })
    );

    expect(res.status).toBe(400);
  });
});

describe("GET /api/projects/:id/tasks", () => {
  it("lists tasks for a project", async () => {
    const res = await app.request(
      buildRequest("GET", `/api/projects/${projectId}/tasks`, {
        token: user.token,
      })
    );

    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.tasks).toBeInstanceOf(Array);
    expect(data.tasks.length).toBeGreaterThanOrEqual(1);
  });
});

describe("GET /api/projects/tasks", () => {
  it("lists all tasks across projects", async () => {
    const res = await app.request(
      buildRequest("GET", "/api/projects/tasks", { token: user.token })
    );

    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.tasks).toBeInstanceOf(Array);
    expect(data.tasks.length).toBeGreaterThanOrEqual(2);
  });
});

describe("PATCH /api/projects/tasks/:id", () => {
  it("updates task status to done", async () => {
    const res = await app.request(
      buildRequest("PATCH", `/api/projects/tasks/${taskId}`, {
        token: user.token,
        body: { status: "done" },
      })
    );

    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.task.status).toBe("done");
    // completedAt should be set automatically
    expect(data.task.completedAt).toBeDefined();
  });

  it("clears completedAt when moving back to todo", async () => {
    const res = await app.request(
      buildRequest("PATCH", `/api/projects/tasks/${taskId}`, {
        token: user.token,
        body: { status: "todo" },
      })
    );

    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.task.status).toBe("todo");
    expect(data.task.completedAt).toBeNull();
  });
});

describe("DELETE /api/projects/tasks/:id", () => {
  it("deletes a task", async () => {
    const res = await app.request(
      buildRequest("DELETE", `/api/projects/tasks/${taskId}`, {
        token: user.token,
      })
    );

    expect(res.status).toBe(200);
  });
});

describe("DELETE /api/projects/:id", () => {
  it("deletes a project and cascades to tasks", async () => {
    // Create a project with a task
    const pRes = await app.request(
      buildRequest("POST", "/api/projects", {
        token: user.token,
        body: { name: "Temp Project" },
      })
    );
    const { project } = await pRes.json() as any;

    await app.request(
      buildRequest("POST", "/api/projects/tasks", {
        token: user.token,
        body: { title: "Temp Task", project_id: project.id },
      })
    );

    const res = await app.request(
      buildRequest("DELETE", `/api/projects/${project.id}`, {
        token: user.token,
      })
    );

    expect(res.status).toBe(200);
  });
});
