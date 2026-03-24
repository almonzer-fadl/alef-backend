/**
 * Auth Route Tests
 *
 * Tests signup, signin, and profile retrieval.
 * Auth is the foundation — if these fail, nothing else works.
 */

import { describe, it, expect, afterAll } from "bun:test";
import { app } from "../src/index";
import { buildRequest, expectJson, cleanupTestUser } from "./helpers";

const EMAIL = `auth-test-${Date.now()}@alef.test`;
const PASSWORD = "secure-password-123";
const NAME = "Auth Test User";

let token: string;
let userId: string;

describe("POST /api/auth/sign-up", () => {
  it("creates a new user and returns a token", async () => {
    const res = await app.request(
      buildRequest("POST", "/api/auth/sign-up", {
        body: { email: EMAIL, password: PASSWORD, name: NAME },
      })
    );

    expect(res.status).toBe(201);
    const data = await res.json() as any;
    expect(data.token).toBeDefined();
    expect(data.user.email).toBe(EMAIL.toLowerCase());
    expect(data.user.name).toBe(NAME);
    expect(data.user.id).toBeDefined();

    token = data.token;
    userId = data.user.id;
  });

  it("rejects duplicate email", async () => {
    const res = await app.request(
      buildRequest("POST", "/api/auth/sign-up", {
        body: { email: EMAIL, password: PASSWORD, name: NAME },
      })
    );

    expect(res.status).toBe(409);
    const data = await res.json() as any;
    expect(data.error).toContain("already");
  });

  it("rejects missing fields", async () => {
    const res = await app.request(
      buildRequest("POST", "/api/auth/sign-up", {
        body: { email: "bad@test.com" },
      })
    );

    expect(res.status).toBe(400);
  });

  it("rejects short password", async () => {
    const res = await app.request(
      buildRequest("POST", "/api/auth/sign-up", {
        body: { email: "short@test.com", password: "12345", name: "Short" },
      })
    );

    expect(res.status).toBe(400);
  });

  it("rejects invalid email format", async () => {
    const res = await app.request(
      buildRequest("POST", "/api/auth/sign-up", {
        body: { email: "not-an-email", password: PASSWORD, name: "Bad" },
      })
    );

    expect(res.status).toBe(400);
  });
});

describe("POST /api/auth/sign-in", () => {
  it("signs in with correct credentials", async () => {
    const res = await app.request(
      buildRequest("POST", "/api/auth/sign-in", {
        body: { email: EMAIL, password: PASSWORD },
      })
    );

    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.token).toBeDefined();
    expect(data.user.email).toBe(EMAIL.toLowerCase());
  });

  it("rejects wrong password", async () => {
    const res = await app.request(
      buildRequest("POST", "/api/auth/sign-in", {
        body: { email: EMAIL, password: "wrong-password" },
      })
    );

    expect(res.status).toBe(401);
    const data = await res.json() as any;
    expect(data.error).toContain("Invalid");
  });

  it("rejects non-existent email", async () => {
    const res = await app.request(
      buildRequest("POST", "/api/auth/sign-in", {
        body: { email: "ghost@nowhere.com", password: PASSWORD },
      })
    );

    expect(res.status).toBe(401);
  });
});

describe("GET /api/auth/me", () => {
  it("returns user profile with valid token", async () => {
    const res = await app.request(
      buildRequest("GET", "/api/auth/me", { token })
    );

    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.user.email).toBe(EMAIL.toLowerCase());
    expect(data.user.name).toBe(NAME);
  });

  it("rejects request without token", async () => {
    const res = await app.request(
      buildRequest("GET", "/api/auth/me")
    );

    expect(res.status).toBe(401);
  });

  it("rejects invalid token", async () => {
    const res = await app.request(
      buildRequest("GET", "/api/auth/me", { token: "invalid.jwt.token" })
    );

    expect(res.status).toBe(401);
  });
});

afterAll(async () => {
  if (userId) await cleanupTestUser(userId);
});
