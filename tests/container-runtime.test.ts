import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { execFileSync } from "node:child_process";
import { basename, dirname, join, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
function inside(base: string, relative: string) {
  const path = resolve(base, relative);
  assert.ok(path === base || path.startsWith(base + sep), "COPY stays inside the fixture/context");
  return path;
}

test("Docker runtime COPY includes source modules required by the real server", () => {
  const fixture = mkdtempSync(join(tmpdir(), "studyroom-runtime-layout-"));
  try {
    const lines = readFileSync(join(root, "Dockerfile"), "utf8").split(/\r?\n/);
    let lastFrom = -1;
    lines.forEach((line, index) => {
      if (/^FROM\s/.test(line)) lastFrom = index;
    });
    assert.ok(lastFrom >= 0);
    for (const line of lines.slice(lastFrom + 1)) {
      if (!line.startsWith("COPY ")) continue;
      // The project's COPY instructions use unquoted paths. Reject unsupported
      // syntax rather than silently testing a different image layout.
      assert.doesNotMatch(line, /[\[\]"']/);
      const parts = line.trim().split(/\s+/).slice(1);
      const fromBuild = parts[0].startsWith("--from=");
      if (fromBuild) assert.equal(parts.shift(), "--from=build");
      const destination = parts.pop()!;
      assert.ok(parts.length);
      for (let source of parts) {
        if (fromBuild) {
          assert.ok(source.startsWith("/app/"));
          source = source.slice("/app/".length);
        }
        const target = inside(
          fixture,
          parts.length > 1 || destination.endsWith("/")
            ? join(destination, basename(source))
            : destination,
        );
        mkdirSync(dirname(target), { recursive: true });
        cpSync(inside(root, source), target, { recursive: true });
      }
    }
    // Reuse installed dependencies, but never expose the checkout's src tree.
    // This is a portable runtime-file-layout regression, not a Docker build or
    // an assertion that production-only dependency installation was exercised.
    symlinkSync(realpathSync(join(root, "node_modules")), join(fixture, "node_modules"), "dir");
    const output = execFileSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "--input-type=module",
        "--eval",
        'await import("./server/start.ts"); process.kill(process.pid, "SIGTERM");',
      ],
      {
        cwd: fixture,
        env: { ...process.env, NODE_ENV: "production", PORT: "0" },
        encoding: "utf8",
        timeout: 15000,
        stdio: "pipe",
      },
    );
    assert.match(output, /Study Room .*http:\/\/127\.0\.0\.1:\d+/);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});
