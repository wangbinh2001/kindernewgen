import { expect, test } from "bun:test";
import { and, eq, inArray } from "drizzle-orm";
import { registerParent } from "../../src/auth/register";
import { app } from "../../src/server";
import { db } from "../../src/db";
import {
  foodItems,
  grocerySheetItems,
  grocerySheets,
  ingredients,
  menus,
  operatingCosts,
  recipes,
  schoolMemberships,
  schools,
  students,
  users,
} from "../../src/db/schema";
import { withTenant } from "../../src/db/tenant";

function scenario() {
  const id = crypto.randomUUID();
  const digits = id.replace(/\D/g, "").slice(0, 6).padEnd(6, "0");
  return {
    schoolA: `test-menu-a-${id}`,
    schoolB: `test-menu-b-${id}`,
    adminA: `0941${digits}`,
    adminB: `0942${digits}`,
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
  await member(s.adminB, s.schoolB, "school_admin");
  const studentIds = await withTenant(s.schoolA, async (tx) => {
    const rows = await tx
      .insert(students)
      .values(
        Array.from({ length: 5 }, (_, index) => ({
          id: crypto.randomUUID(),
          schoolId: s.schoolA,
          fullName: `Menu Student ${index + 1}`,
          status: "active",
        })),
      )
      .returning({ id: students.id });
    return rows.map((row) => row.id);
  });
  return {
    adminToken: await login(s.adminA),
    otherToken: await login(s.adminB),
    studentIds,
  };
}

async function cleanup(s: ReturnType<typeof scenario>) {
  for (const schoolId of [s.schoolA, s.schoolB]) {
    await withTenant(schoolId, async (tx) => {
      const sheets = await tx
        .select({ id: grocerySheets.id })
        .from(grocerySheets)
        .where(eq(grocerySheets.schoolId, schoolId));
      if (sheets.length) {
        await tx.delete(grocerySheetItems).where(
          inArray(
            grocerySheetItems.grocerySheetId,
            sheets.map((sheet) => sheet.id),
          ),
        );
      }
      await tx
        .delete(grocerySheets)
        .where(eq(grocerySheets.schoolId, schoolId));
      await tx.delete(menus).where(eq(menus.schoolId, schoolId));
      await tx
        .delete(operatingCosts)
        .where(eq(operatingCosts.schoolId, schoolId));
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
      await tx.delete(students).where(eq(students.schoolId, schoolId));
    });
  }
  const found = await db
    .select()
    .from(users)
    .where(inArray(users.globalPhone, [s.adminA, s.adminB]));
  for (const user of found) {
    await db
      .delete(schoolMemberships)
      .where(eq(schoolMemberships.userId, user.id));
    await db.delete(users).where(eq(users.id, user.id));
  }
  await db.delete(schools).where(inArray(schools.id, [s.schoolA, s.schoolB]));
}

async function createFood(token: string, name: string, category = "breakfast") {
  const response = await app.request("/api/v1/school/food-items", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ name, category }),
  });
  expect(response.status).toBe(201);
  return ((await response.json()) as { data: { id: string } }).data.id;
}

test("menu upsert replaces all items for the same date", async () => {
  const s = scenario();
  try {
    const fixture = await setup(s);
    const foodA = await createFood(fixture.adminToken, "Porridge");
    const foodB = await createFood(
      fixture.adminToken,
      "Rice Lunch",
      "lunch_main",
    );
    const headers = {
      authorization: `Bearer ${fixture.adminToken}`,
      "content-type": "application/json",
    };
    const first = await app.request("/api/v1/school/menus", {
      method: "POST",
      headers,
      body: JSON.stringify({
        date: "2026-09-10",
        items: [
          { mealType: "breakfast", foodItemId: foodA },
          { mealType: "snack", foodItemId: foodA },
        ],
      }),
    });
    expect(first.status).toBe(200);
    const second = await app.request("/api/v1/school/menus", {
      method: "POST",
      headers,
      body: JSON.stringify({
        date: "2026-09-10",
        items: [{ mealType: "lunch", foodItemId: foodB }],
      }),
    });
    expect(second.status).toBe(200);

    const listed = await app.request(
      "/api/v1/school/menus?startDate=2026-09-10&endDate=2026-09-10",
      { headers: { authorization: `Bearer ${fixture.adminToken}` } },
    );
    expect(listed.status).toBe(200);
    const rows = (await listed.json()) as {
      data: Array<{ mealType: string; foodItemId: string; foodName: string }>;
    };
    expect(rows.data).toHaveLength(1);
    expect(rows.data[0]).toMatchObject({
      mealType: "lunch",
      foodItemId: foodB,
      foodName: "Rice Lunch",
    });
  } finally {
    await cleanup(s);
  }
});

test("grocery generation aggregates recipes and subtracts operating costs", async () => {
  const s = scenario();
  try {
    const fixture = await setup(s);
    const foodId = await createFood(fixture.adminToken, "Rice Breakfast");
    const ingredientResponse = await app.request("/api/v1/school/ingredients", {
      method: "POST",
      headers: {
        authorization: `Bearer ${fixture.adminToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        name: "Rice",
        unit: "g",
        pricePerUnit: 2.5,
      }),
    });
    expect(ingredientResponse.status).toBe(201);
    const ingredientId = (
      (await ingredientResponse.json()) as { data: { id: string } }
    ).data.id;
    const commonHeaders = {
      authorization: `Bearer ${fixture.adminToken}`,
      "content-type": "application/json",
    };
    const recipe = await app.request("/api/v1/school/recipes", {
      method: "POST",
      headers: commonHeaders,
      body: JSON.stringify({
        foodItemId: foodId,
        ingredients: [{ ingredientId, quantityPerStudent: 10 }],
      }),
    });
    expect(recipe.status).toBe(200);
    const menu = await app.request("/api/v1/school/menus", {
      method: "POST",
      headers: commonHeaders,
      body: JSON.stringify({
        date: "2026-09-10",
        items: [{ mealType: "breakfast", foodItemId: foodId }],
      }),
    });
    expect(menu.status).toBe(200);
    const costs = await app.request("/api/v1/school/operating-costs", {
      method: "POST",
      headers: commonHeaders,
      body: JSON.stringify({
        month: "2026-09-01",
        electricityCost: 100,
        gasCost: 50,
      }),
    });
    expect(costs.status).toBe(201);

    const generated = await app.request(
      "/api/v1/school/grocery-sheets/generate",
      {
        method: "POST",
        headers: commonHeaders,
        body: JSON.stringify({
          startDate: "2026-09-10",
          endDate: "2026-09-10",
        }),
      },
    );
    expect(generated.status).toBe(201);
    const data = (await generated.json()) as {
      data: {
        id: string;
        totalStudents: number;
        totalFoodCost: number;
        estimatedTotal: number;
        items: Array<{
          ingredientId: string;
          totalQuantity: number;
          totalPrice: number;
        }>;
      };
    };
    expect(data.data).toMatchObject({
      totalStudents: 5,
      totalFoodCost: 125,
      estimatedTotal: -25,
    });
    expect(data.data.items).toHaveLength(1);
    expect(data.data.items[0]).toMatchObject({
      ingredientId,
      totalQuantity: 50,
      totalPrice: 125,
    });

    const detail = await app.request(
      `/api/v1/school/grocery-sheets/${data.data.id}`,
      { headers: { authorization: `Bearer ${fixture.adminToken}` } },
    );
    expect(detail.status).toBe(200);
    const confirmed = await app.request(
      `/api/v1/school/grocery-sheets/${data.data.id}/confirm`,
      {
        method: "PATCH",
        headers: commonHeaders,
        body: JSON.stringify({ actualTotal: 130 }),
      },
    );
    expect(confirmed.status).toBe(200);
    expect(
      (
        (await confirmed.json()) as {
          data: { status: string; actualTotal: number };
        }
      ).data,
    ).toMatchObject({ status: "confirmed", actualTotal: 130 });
  } finally {
    await cleanup(s);
  }
});

test("menu and grocery sheets are isolated across tenants", async () => {
  const s = scenario();
  try {
    const fixture = await setup(s);
    const foodId = await createFood(fixture.adminToken, "Only School A");
    const headers = {
      authorization: `Bearer ${fixture.adminToken}`,
      "content-type": "application/json",
    };
    await app.request("/api/v1/school/menus", {
      method: "POST",
      headers,
      body: JSON.stringify({
        date: "2026-09-10",
        items: [{ mealType: "breakfast", foodItemId: foodId }],
      }),
    });
    const generated = await app.request(
      "/api/v1/school/grocery-sheets/generate",
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          startDate: "2026-09-10",
          endDate: "2026-09-10",
        }),
      },
    );
    expect(generated.status).toBe(201);
    const sheetId = ((await generated.json()) as { data: { id: string } }).data
      .id;
    const otherHeaders = { authorization: `Bearer ${fixture.otherToken}` };
    const menusForOther = await app.request(
      "/api/v1/school/menus?startDate=2026-09-10&endDate=2026-09-10",
      { headers: otherHeaders },
    );
    expect(menusForOther.status).toBe(200);
    expect(
      ((await menusForOther.json()) as { data: unknown[] }).data,
    ).toHaveLength(0);
    const sheetForOther = await app.request(
      `/api/v1/school/grocery-sheets/${sheetId}`,
      { headers: otherHeaders },
    );
    expect(sheetForOther.status).toBe(404);
  } finally {
    await cleanup(s);
  }
});
