/**
 * Diet Route Tests
 *
 * Tests meal logging with macro tracking.
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { app } from "../src/index";
import { buildRequest, createTestUser, cleanupTestUser, type TestUser } from "./helpers";

let user: TestUser;
let mealId: string;
const today = new Date().toISOString().split("T")[0]!;

beforeAll(async () => {
  user = await createTestUser("diet");
});

afterAll(async () => {
  await cleanupTestUser(user.id);
});

describe("POST /api/diet", () => {
  it("logs a meal with macros", async () => {
    const res = await app.request(
      buildRequest("POST", "/api/diet", {
        token: user.token,
        body: {
          date: today,
          mealType: "lunch",
          name: "Chicken Rice",
          calories: 650,
          protein: 45,
          carbs: 70,
          fat: 15,
        },
      })
    );

    expect(res.status).toBe(201);
    const data = await res.json() as any;
    expect(data.meal.name || data.meal.mealType).toBeDefined();
    mealId = data.meal.id;
  });

  it("logs breakfast", async () => {
    const res = await app.request(
      buildRequest("POST", "/api/diet", {
        token: user.token,
        body: {
          date: today,
          mealType: "breakfast",
          name: "Oatmeal",
          calories: 300,
          protein: 10,
          carbs: 50,
          fat: 8,
        },
      })
    );

    expect(res.status).toBe(201);
  });
});

describe("GET /api/diet", () => {
  it("lists meals", async () => {
    const res = await app.request(
      buildRequest("GET", "/api/diet", { token: user.token })
    );

    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.meals).toBeInstanceOf(Array);
    expect(data.meals.length).toBeGreaterThanOrEqual(2);
  });

  it("filters by date", async () => {
    const res = await app.request(
      buildRequest("GET", `/api/diet?date=${today}`, { token: user.token })
    );

    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.meals).toBeInstanceOf(Array);
  });
});

describe("PATCH /api/diet/:id", () => {
  it("updates meal calories", async () => {
    const res = await app.request(
      buildRequest("PATCH", `/api/diet/${mealId}`, {
        token: user.token,
        body: { calories: 700 },
      })
    );

    expect(res.status).toBe(200);
  });
});

describe("DELETE /api/diet/:id", () => {
  it("deletes a meal", async () => {
    const res = await app.request(
      buildRequest("DELETE", `/api/diet/${mealId}`, { token: user.token })
    );

    expect(res.status).toBe(200);
  });
});
