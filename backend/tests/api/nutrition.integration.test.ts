import { expect, test } from "bun:test";
import { and, eq, inArray } from "drizzle-orm";
import { registerParent } from "../../src/auth/register";
import { app } from "../../src/server";
import { db } from "../../src/db";
import {
  foodItems,
  ingredients,
  recipes,
  schoolMemberships,
  schools,
  users,
} from "../../src/db/schema";
import { withTenant } from "../../src/db/tenant";

function scenario() {
  const id = crypto.randomUUID();
  const digits = id.replace(/\D/g, "").slice(0, 6).padEnd(6, "0");
  return {
    schoolA: `test-nutrition-a-${id}`,
    schoolB: `test-nutrition-b-${id}`,
    adminA: `0931${digits}`,
    staffA: `0932${digits}`,
    adminB: `0933${digits}`,
  };
}

async function login(phone: string) {
  const response = await app.request("/api/v1/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ phone, password: "123456" }),
  });
  expect(response.status).toBe(200);
  return ((await response.json()) as { data: { token: string } }).data.token;
}

async function member(phone: string, schoolId: string, role: string) {
  await registerParent({ phone, schoolId, displayName: role });
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.globalPhone, phone));
  await db
    .update(schoolMemberships)
    .set({ role })
    .where(
      and(
        eq(schoolMemberships.userId, user!.id),
        eq(schoolMemberships.schoolId, schoolId),
      ),
    );
}

async function setup(s: ReturnType<typeof scenario>) {
  await db.insert(schools).values([
    { id: s.schoolA, name: s.schoolA },
    { id: s.schoolB, name: s.schoolB },
  ]);
  await member(s.adminA, s.schoolA, "school_admin");
  await member(s.staffA, s.schoolA, "staff");
  await member(s.adminB, s.schoolB, "school_admin");
  return {
    adminToken: await login(s.adminA),
    staffToken: await login(s.staffA),
    otherToken: await login(s.adminB),
  };
}

async function cleanup(s: ReturnType<typeof scenario>) {
  for (const schoolId of [s.schoolA, s.schoolB]) {
    await withTenant(schoolId, async (tx) => {
      const foods = await tx
        .select({ id: foodItems.id })
        .from(foodItems)
        .where(eq(foodItems.schoolId, schoolId));
      if (foods.length) {
        await tx.delete(recipes).where(
          inArray(
            recipes.foodItemId,
            foods.map((food) => food.id),
          ),
        );
      }
      await tx.delete(foodItems).where(eq(foodItems.schoolId, schoolId));
      await tx.delete(ingredients).where(eq(ingredients.schoolId, schoolId));
    });
  }
  const found = await db
    .select()
    .from(users)
    .where(inArray(users.globalPhone, [s.adminA, s.staffA, s.adminB]));
  for (const user of found) {
    await db
      .delete(schoolMemberships)
      .where(eq(schoolMemberships.userId, user.id));
    await db.delete(users).where(eq(users.id, user.id));
  }
  await db.delete(schools).where(inArray(schools.id, [s.schoolA, s.schoolB]));
}

test("school admin and staff can CRUD food items and ingredients", async () => {
  const s = scenario();
  try {
    const fixture = await setup(s);
    const adminHeaders = {
      authorization: `Bearer ${fixture.adminToken}`,
      "content-type": "application/json",
    };
    const staffHeaders = {
      authorization: `Bearer ${fixture.staffToken}`,
      "content-type": "application/json",
    };
    const foodResponse = await app.request("/api/v1/school/food-items", {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({
        name: "Chicken Porridge",
        category: "breakfast",
        description: "Warm breakfast",
      }),
    });
    expect(foodResponse.status).toBe(201);
    const foodId = ((await foodResponse.json()) as { data: { id: string } })
      .data.id;

    const ingredientResponse = await app.request("/api/v1/school/ingredients", {
      method: "POST",
      headers: staffHeaders,
      body: JSON.stringify({ name: "Rice", unit: "g", pricePerUnit: 0.02 }),
    });
    expect(ingredientResponse.status).toBe(201);
    const ingredientId = (
      (await ingredientResponse.json()) as { data: { id: string } }
    ).data.id;

    const listed = await app.request("/api/v1/school/food-items", {
      headers: { authorization: `Bearer ${fixture.staffToken}` },
    });
    expect(listed.status).toBe(200);
    expect(
      ((await listed.json()) as { data: Array<{ id: string }> }).data,
    ).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: foodId })]),
    );

    const updatedFood = await app.request(
      `/api/v1/school/food-items/${foodId}`,
      {
        method: "PUT",
        headers: adminHeaders,
        body: JSON.stringify({ name: "Chicken Rice Porridge" }),
      },
    );
    expect(updatedFood.status).toBe(200);

    const updatedIngredient = await app.request(
      `/api/v1/school/ingredients/${ingredientId}`,
      {
        method: "PUT",
        headers: staffHeaders,
        body: JSON.stringify({ pricePerUnit: 0.03 }),
      },
    );
    expect(updatedIngredient.status).toBe(200);
    expect(
      ((await updatedIngredient.json()) as { data: { pricePerUnit: number } })
        .data.pricePerUnit,
    ).toBe(0.03);

    const deleted = await app.request(`/api/v1/school/food-items/${foodId}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${fixture.adminToken}` },
    });
    expect(deleted.status).toBe(200);
  } finally {
    await cleanup(s);
  }
});

test("recipe upsert replaces links and food detail joins ingredient data", async () => {
  const s = scenario();
  try {
    const fixture = await setup(s);
    const headers = {
      authorization: `Bearer ${fixture.staffToken}`,
      "content-type": "application/json",
    };
    const food = await app.request("/api/v1/school/food-items", {
      method: "POST",
      headers,
      body: JSON.stringify({ name: "Vegetable Soup", category: "lunch_soup" }),
    });
    const foodId = ((await food.json()) as { data: { id: string } }).data.id;
    const ids: string[] = [];
    for (const [name, unit] of [
      ["Carrot", "g"],
      ["Water", "ml"],
    ] as const) {
      const ingredient = await app.request("/api/v1/school/ingredients", {
        method: "POST",
        headers,
        body: JSON.stringify({ name, unit, pricePerUnit: 0.01 }),
      });
      ids.push(((await ingredient.json()) as { data: { id: string } }).data.id);
    }

    const first = await app.request("/api/v1/school/recipes", {
      method: "POST",
      headers,
      body: JSON.stringify({
        foodItemId: foodId,
        ingredients: [
          { ingredientId: ids[0], quantityPerStudent: 40 },
          { ingredientId: ids[1], quantityPerStudent: 150 },
        ],
      }),
    });
    expect(first.status).toBe(200);

    const second = await app.request("/api/v1/school/recipes", {
      method: "POST",
      headers,
      body: JSON.stringify({
        foodItemId: foodId,
        ingredients: [{ ingredientId: ids[1], quantityPerStudent: 200 }],
      }),
    });
    expect(second.status).toBe(200);

    const detail = await app.request(`/api/v1/school/food-items/${foodId}`, {
      headers: { authorization: `Bearer ${fixture.staffToken}` },
    });
    expect(detail.status).toBe(200);
    const data = (
      (await detail.json()) as {
        data: {
          recipes: Array<{
            ingredientId: string;
            ingredientName: string;
            unit: string;
            quantityPerStudent: number;
          }>;
        };
      }
    ).data;
    expect(data.recipes).toHaveLength(1);
    expect(data.recipes[0]).toMatchObject({
      ingredientId: ids[1],
      ingredientName: "Water",
      unit: "ml",
      quantityPerStudent: 200,
    });
  } finally {
    await cleanup(s);
  }
});

test("ingredient deletion is blocked while it is used by a recipe", async () => {
  const s = scenario();
  try {
    const fixture = await setup(s);
    const headers = {
      authorization: `Bearer ${fixture.adminToken}`,
      "content-type": "application/json",
    };
    const food = await app.request("/api/v1/school/food-items", {
      method: "POST",
      headers,
      body: JSON.stringify({ name: "Rice Meal", category: "lunch_main" }),
    });
    const foodId = ((await food.json()) as { data: { id: string } }).data.id;
    const ingredient = await app.request("/api/v1/school/ingredients", {
      method: "POST",
      headers,
      body: JSON.stringify({ name: "Rice", unit: "g", pricePerUnit: 0.02 }),
    });
    const ingredientId = ((await ingredient.json()) as { data: { id: string } })
      .data.id;
    const recipe = await app.request("/api/v1/school/recipes", {
      method: "POST",
      headers,
      body: JSON.stringify({
        foodItemId: foodId,
        ingredients: [{ ingredientId, quantityPerStudent: 50 }],
      }),
    });
    expect(recipe.status).toBe(200);

    const deleted = await app.request(
      `/api/v1/school/ingredients/${ingredientId}`,
      {
        method: "DELETE",
        headers: { authorization: `Bearer ${fixture.adminToken}` },
      },
    );
    expect(deleted.status).toBe(400);
    expect(
      ((await deleted.json()) as { error: { code: string } }).error.code,
    ).toBe("VALIDATION_ERROR");
  } finally {
    await cleanup(s);
  }
});

test("nutrition data is isolated across tenants", async () => {
  const s = scenario();
  try {
    const fixture = await setup(s);
    const created = await app.request("/api/v1/school/food-items", {
      method: "POST",
      headers: {
        authorization: `Bearer ${fixture.adminToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ name: "Only School A", category: "snack" }),
    });
    expect(created.status).toBe(201);
    const foodId = ((await created.json()) as { data: { id: string } }).data.id;

    const otherList = await app.request("/api/v1/school/food-items", {
      headers: { authorization: `Bearer ${fixture.otherToken}` },
    });
    expect(otherList.status).toBe(200);
    expect(((await otherList.json()) as { data: unknown[] }).data).toHaveLength(
      0,
    );

    const otherDetail = await app.request(
      `/api/v1/school/food-items/${foodId}`,
      { headers: { authorization: `Bearer ${fixture.otherToken}` } },
    );
    expect(otherDetail.status).toBe(404);
  } finally {
    await cleanup(s);
  }
});
