import { expect, type Page } from "@playwright/test";

export async function visitWorkspace(
  page: Page,
  name: "Study" | "Plan" | "Music" | "Together" | "Progress" | "Guide",
) {
  const link = page.getByRole("navigation", { name: "Workspace", exact: true }).getByRole("link", {
    name,
    exact: true,
  });
  await link.click();
  await expect(link).toHaveAttribute("aria-current", "page");
}
