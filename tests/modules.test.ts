/**
 * Modules Route Tests
 *
 * Tests module enabling/disabling.
 * Users can toggle which life-tracking modules appear in their app.
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { app } from "../src/index";
import { buildRequest, createTestUser, cleanupTestUser, type TestUser } from "./helpers";

let user: TestUser;

beforeAll(async () => {
  user = await createTestUser("modules");
});

afterAll(async () => {
  await cleanupTestUser(user.id);
});

describe("GET /api/modules", () => {
  it("returns list of all modules with enabled status", async () => {
    const res = await app.request(
      buildRequest("GET", "/api/modules", { token: user.token })
    );

    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.modules).toBeInstanceOf(Array);
    expect(data.modules.length).toBeGreaterThan(0);

    // Each module should have key, label, enabled fields
    for (const mod of data.modules) {
      expect(mod.key).toBeDefined();
      expect(mod.label).toBeDefined();
      expect(typeof mod.enabled).toBe("boolean");
    }
  });

  it("rejects without auth", async () => {
    const res = await app.request(
      buildRequest("GET", "/api/modules")
    );

    expect(res.status).toBe(401);
  });
});

describe("PATCH /api/modules/:key", () => {
  it("enables a module", async () => {
    const res = await app.request(
      buildRequest("PATCH", "/api/modules/fitness", {
        token: user.token,
        body: { enabled: true },
      })
    );

    expect([200, 201]).toContain(res.status);
  });

  it("disables a module", async () => {
    const res = await app.request(
      buildRequest("PATCH", "/api/modules/fitness", {
        token: user.token,
        body: { enabled: false },
      })
    );

    expect(res.status).toBe(200);
  });

  it("persists module state", async () => {
    // Enable
    await app.request(
      buildRequest("PATCH", "/api/modules/diet", {
        token: user.token,
        body: { enabled: true },
      })
    );

    // Verify
    const res = await app.request(
      buildRequest("GET", "/api/modules", { token: user.token })
    );

    const data = await res.json() as any;
    const diet = data.modules.find((m: any) => m.key === "diet");
    expect(diet?.enabled).toBe(true);
  });
});
