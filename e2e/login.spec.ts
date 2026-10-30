import { test, expect } from "@playwright/test";

test("login page is phone-first in Arabic", async ({ page }) => {
  await page.goto("/ar/login");
  await expect(page.locator("html")).toHaveAttribute("lang", "ar");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.getByRole("heading")).toContainText("ادخل");
  await expect(page.getByRole("tab", { name: "الجوال" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "الإيميل" })).toBeVisible();
  await expect(page.locator(".phone-cc")).toHaveText("+966");
  await expect(page.getByRole("button", { name: "دخول" })).toBeVisible();
  await expect(page.getByText("إعادة إرسال الرمز")).toHaveCount(0);
});

test("english login works", async ({ page }) => {
  await page.goto("/en/login");
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
  await expect(page.getByRole("heading")).toContainText("Sign in");
  await expect(page.getByRole("tab", { name: "Phone" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Email" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
});
