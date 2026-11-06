import { test, expect } from "@playwright/test";

for (const [width, height] of [
  [1280, 800],
  [390, 667],
]) {
  test(`Moon restores CSS sizing after both normal presets at ${width}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height });
    await page.goto("/");
    await page.getByRole("button", { name: /^Continue (?:to Study Room|last session)$/ }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const choose = async (name: string) => {
      await page.locator(".appearance > summary").click();
      await page.getByRole("button", { name, exact: true }).click();
      await page.locator(".appearance > summary").click();
    };
    const sizes = () =>
      page.locator(".natural-flowers > svg.flower").evaluateAll((es) =>
        es.map((e) => {
          const css = getComputedStyle(e);
          return {
            width: css.width,
            height: css.height,
            translate: css.translate,
            inlineWidth: (e as SVGElement).style.width,
            inlineHeight: (e as SVGElement).style.height,
          };
        }),
      );
    await choose("Moon Garden");
    await expect(page.locator(".natural-flowers > svg.flower")).toHaveCount(48);
    const direct = await sizes();
    for (const preset of ["Juliette", "Autumn Letters"]) {
      await choose(preset);
      await expect(page.locator(".natural-flowers > svg.flower")).toHaveCount(
        preset === "Juliette" ? 48 : 64,
      );
      await choose("Moon Garden");
      const restored = await sizes();
      await info.attach(`${preset}-Moon-styles`, {
        body: JSON.stringify({ direct, restored }, null, 2),
        contentType: "application/json",
      });
      expect.soft(restored).toEqual(direct);
      await expect(page.locator(".natural-flowers > svg.flower")).toHaveCount(48);
      await expect(page.locator(".natural-flowers > .moon-stars")).toHaveCount(1);
      await expect(page.locator(".natural-flowers > .moon-stars > svg.star")).toHaveCount(24);
      await expect(page.locator("svg.flower .moon-stars")).toHaveCount(0);
    }
  });
}
