import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import { Flowers } from "../src/Flowers.js";

test("Moon bodies have five rounded outer tips alternating with five recessed valleys", () => {
  const dom = new JSDOM(renderToStaticMarkup(<Flowers effect="moon-static" />));
  try {
    const bodies = dom.window.document.querySelectorAll(".flower-layer > svg.flower");
    assert.equal(bodies.length, 48);
    for (const body of bodies) {
      const d = body.querySelector("path")!.getAttribute("d")!;
      // Inspect actual quadratic corner geometry, not a data marker or artwork name.
      const corners = [...d.matchAll(/Q\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)/g)];
      assert.equal(
        corners.length,
        10,
        "five softened star tips and five softened valleys, not a crescent/diamond",
      );
      const radii = corners.map((m) => Math.hypot(Number(m[1]) - 20, Number(m[2]) - 20));
      assert.equal(radii.filter((r) => r > 16).length, 5);
      assert.equal(radii.filter((r) => r < 11).length, 5);
      radii.forEach((r, i) => assert.notEqual(r > 16, radii[(i + 1) % 10] > 16));
    }
  } finally {
    dom.window.close();
  }
});

test("Moon material references stay local across sibling component instances", () => {
  const dom = new JSDOM(
    renderToStaticMarkup(
      <>
        <Flowers effect="moon-static" />
        <Flowers effect="moon-falling" />
      </>,
    ),
  );
  try {
    const doc = dom.window.document;
    const ids = [...doc.querySelectorAll("[id]")].map((e) => e.id);
    assert.equal(ids.length, 96);
    assert.equal(new Set(ids).size, ids.length);
    for (const body of doc.querySelectorAll("svg.flower")) {
      const paint = body.querySelector("path")!.getAttribute("fill")!;
      const id = paint.slice(5, -1);
      const gradient = doc.getElementById(id)!;
      assert.ok(body.contains(gradient), "each star resolves its own directional material");
      assert.equal(gradient.querySelectorAll("stop").length, 4);
      assert.equal(body.querySelectorAll("path").length, 3, "body, bevel and reflected edge");
      assert.equal(body.querySelectorAll("div, svg, image, filter").length, 0);
    }
    assert.equal(doc.querySelectorAll(".flower-layer > .moon-stars").length, 2);
    assert.equal(doc.querySelectorAll(".moon-stars > svg.star").length, 48);
  } finally {
    dom.window.close();
  }
});
