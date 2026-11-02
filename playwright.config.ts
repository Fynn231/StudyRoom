import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 90000,
  workers: 1,
  outputDir: ".test-output/browser",
  reporter: [["list"], ["json", { outputFile: ".test-output/browser-results.json" }]],
  use: {
    baseURL: "http://127.0.0.1:4285",
    launchOptions: {
      executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    },
    screenshot: "only-on-failure",
    video: "on",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm start",
    env: { PORT: "4285" },
    url: "http://127.0.0.1:4285/healthz",
    reuseExistingServer: false,
  },
});
