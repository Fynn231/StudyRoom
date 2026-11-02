import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

// Produce an isolated Safari candidate. Never mutate Chromium sources or overwrite
// an existing Xcode project; Apple signing/installation stay explicit owner actions.
const destination = resolve(".test-output/safari-extension");
mkdirSync(destination, { recursive: true });
for (const file of ["popup.html", "popup.css", "popup.js", "rules.js"]) {
  cpSync(resolve("extension", file), resolve(destination, file));
}
const rules = readFileSync("extension/rules.js", "utf8").replaceAll("export function", "function");
const background = readFileSync("extension/background.js", "utf8").replace(/^import .*?;\s*/, "");
// Safari uses a nonpersistent background page rather than Chromium's service worker.
writeFileSync(resolve(destination, "background.js"), `${rules}\n${background}`);
const manifest = JSON.parse(readFileSync("extension/manifest.json", "utf8"));
manifest.background = { scripts: ["background.js"], persistent: false };
manifest.name = "Study Room Focus Blocker — Safari candidate";
writeFileSync(resolve(destination, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log(
  "Prepared Safari candidate resources. Not built, signed, installed or device-verified.",
);
if (!process.argv.includes("--xcode")) process.exit(0);
const identifier = process.env.SAFARI_BUNDLE_IDENTIFIER;
if (!identifier || !/^[a-zA-Z][a-zA-Z0-9-]*(\.[a-zA-Z0-9-]+){2,}$/.test(identifier)) {
  console.error(
    "Set SAFARI_BUNDLE_IDENTIFIER to an identifier owned by your Apple development team.",
  );
  process.exit(2);
}
const tool = ["safari-web-extension-packager", "safari-web-extension-converter"].find(
  (name) => spawnSync("xcrun", ["--find", name], { stdio: "ignore" }).status === 0,
);
if (!tool) {
  console.error("UNAVAILABLE: full Xcode with Apple's Safari extension packager is required.");
  process.exit(2);
}
const project = resolve(".test-output/safari-xcode");
if (existsSync(project)) {
  console.error("Refusing to overwrite an existing Safari Xcode project. Review it separately.");
  process.exit(2);
}
const result = spawnSync(
  "xcrun",
  [
    tool,
    destination,
    "--project-location",
    project,
    "--app-name",
    "Study Room Focus",
    "--bundle-identifier",
    identifier,
    "--swift",
    "--copy-resources",
    "--no-open",
    "--no-prompt",
  ],
  { stdio: "inherit" },
);
process.exit(result.status ?? 2);
