import { expect, test } from "@playwright/test";

test.describe("KinderNewGenz landing page", () => {
  test("desktop composition is usable and captures a reference screenshot", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "desktop-only scenario");
    await page.goto("/");

    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Điều hành trường nhẹ hơn. Kết nối phụ huynh tốt hơn.",
    );
    await expect(page.getByText("Sĩ số hoạt động")).toBeVisible();
    await expect(page.getByText("Tổng quan học phí")).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Đặt lịch tư vấn" }).first(),
    ).toBeVisible();
    await expect(page.locator("body")).toHaveJSProperty("scrollWidth", 1440);

    await page.getByRole("tab", { name: "Giáo viên" }).click();
    await expect(page.getByRole("tabpanel")).toContainText("Giáo viên");

    await page.screenshot({
      path: "test-results/landing-desktop.png",
      fullPage: true,
    });
  });

  test("mobile menu, role tabs and consultation form work without horizontal overflow", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "mobile-only scenario");
    await page.goto("/");
    await expect(page.locator("body")).toHaveJSProperty("scrollWidth", 390);

    await page.getByRole("button", { name: "Mở menu" }).click();
    const dialog = page.getByRole("dialog", { name: "Điều hướng" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("link", { name: "Bảng giá" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();

    await page.getByRole("tab", { name: "Phụ huynh" }).click();
    await expect(page.getByRole("tabpanel")).toContainText("Phụ huynh");

    await page.getByRole("link", { name: "Đặt lịch tư vấn" }).first().click();
    await page.getByLabel("Họ và tên").fill("Nguyễn Minh Anh");
    await page.getByLabel("Tên trường").fill("Mầm non Ánh Dương");
    await page.getByLabel("Số điện thoại").fill("0901234567");
    await page.getByRole("button", { name: "Đặt lịch tư vấn" }).click();
    await expect(page.getByRole("status")).toContainText(
      "đã nhận được yêu cầu",
    );

    await page.screenshot({
      path: "test-results/landing-mobile.png",
      fullPage: true,
    });
  });
});
