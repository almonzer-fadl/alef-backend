/**
 * Fitness Route Tests
 *
 * Tests workout CRUD with exercise sets.
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { app } from "../src/index";
import { buildRequest, createTestUser, cleanupTestUser, type TestUser } from "./helpers";

let user: TestUser;
let workoutId: string;

beforeAll(async () => {
  user = await createTestUser("fitness");
});

afterAll(async () => {
  await cleanupTestUser(user.id);
});

describe("POST /api/fitness", () => {
  it("creates a strength workout with sets", async () => {
    const res = await app.request(
      buildRequest("POST", "/api/fitness", {
        token: user.token,
        body: {
          date: new Date().toISOString().split("T")[0],
          type: "strength",
          durationMin: 60,
          exercises: JSON.stringify([
            { name: "Bench Press", sets: 4, reps: 8, weight_kg: 80 },
            { name: "Overhead Press", sets: 3, reps: 10, weight_kg: 40 },
          ]),
          notes: "Felt strong today",
        },
      })
    );

    expect(res.status).toBe(201);
    const data = await res.json() as any;
    expect(data.workout.name || data.workout.type).toBeDefined();
    workoutId = data.workout.id;
  });

  it("creates a cardio workout", async () => {
    const res = await app.request(
      buildRequest("POST", "/api/fitness", {
        token: user.token,
        body: {
          date: new Date().toISOString().split("T")[0],
          type: "cardio",
          durationMin: 30,
          caloriesBurned: 350,
        },
      })
    );

    expect(res.status).toBe(201);
  });
});

describe("GET /api/fitness", () => {
  it("lists workouts", async () => {
    const res = await app.request(
      buildRequest("GET", "/api/fitness", { token: user.token })
    );

    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.workouts).toBeInstanceOf(Array);
    expect(data.workouts.length).toBeGreaterThanOrEqual(2);
  });
});

describe("GET /api/fitness/:id", () => {
  it("returns a single workout", async () => {
    const res = await app.request(
      buildRequest("GET", `/api/fitness/${workoutId}`, { token: user.token })
    );

    expect(res.status).toBe(200);
  });
});

describe("PATCH /api/fitness/:id", () => {
  it("updates workout notes", async () => {
    const res = await app.request(
      buildRequest("PATCH", `/api/fitness/${workoutId}`, {
        token: user.token,
        body: { notes: "PR on bench!" },
      })
    );

    expect(res.status).toBe(200);
  });
});

describe("DELETE /api/fitness/:id", () => {
  it("deletes a workout", async () => {
    const res = await app.request(
      buildRequest("DELETE", `/api/fitness/${workoutId}`, {
        token: user.token,
      })
    );

    expect(res.status).toBe(200);
  });
});
