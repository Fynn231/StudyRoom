import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { JSDOM } from "jsdom";
import { Flowers } from "../src/Flowers.js";
test("Juliette restores original 48 shaded five-petal blossoms", async (t) => {
  const dom = new JSDOM("<!doctype html><body></body>", { url: "http://localhost" });
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  const { render, cleanup } = await import("@testing-library/react");
  t.after(() => {
    cleanup();
    dom.window.close();
  });
  const view = render(<Flowers effect="static" />);
  const bodies = [...view.container.querySelectorAll("svg.flower")];
  assert.equal(bodies.length, 48);
  for (const body of bodies) {
    assert.ok(
      parseFloat((body as SVGElement).style.getPropertyValue("--size")) >= 42,
      "dimensional meshes retain the historical legible 42–63px base size",
    );
    assert.equal(body.getAttribute("viewBox"), "-1.7 -1.7 3.4 3.4");
    assert.equal(
      body.querySelectorAll("path").length,
      160,
      "five depth-sorted cupped petal meshes, 32 faces per petal",
    );
    assert.ok(
      new Set([...body.querySelectorAll("path")].map((p) => p.getAttribute("fill"))).size > 8,
      "Lambert shading varies across real mesh faces",
    );
    assert.equal(body.querySelector("ellipse")?.getAttribute("rx"), ".145");
  }
});
