# Optional Study Room Focus Blocker

Chrome/Edge desktop, Manifest V3. This is an unpacked developer release, not a published Web Store extension. Installing and granting permissions is your choice and must be done by you.

1. Download the ZIP from Study Room → Protect your focus and extract it.
2. Open chrome://extensions (or edge://extensions), enable Developer mode, choose Load unpacked and select the extracted folder containing manifest.json.
3. Review the requested blocking/storage/alarm permissions. No host/content/history/tabs permissions or content scripts are requested.
4. Open the extension popup, enter 1–50 domain names and 1–180 minutes, and press Start blocking.
5. Stop blocking at any time from its popup; disabling/removing the extension also stops it.

The extension blocks top-level HTTP/HTTPS page loads with declarative rules, including subdomains. It does not read website content, browsing history or credentials, send telemetry, silence system notifications, control other browsers or guarantee already-playing media stops. Study Room's own host and parent domains cannot be blocked. Rules expire via an alarm, are checked on worker wakeup, and are cleared on browser startup/update. The Study Room website neither installs it nor claims its state is active. Timers and blocking are deliberately started separately. Safari/mobile installation is not supported by this package.

Source is included. Packaging is reproducible with `node scripts/package-focus-extension.mjs` from the repository root.

## Safari / iOS candidate (not released)

`npm run extension:safari:prepare` creates isolated candidate resources under ignored `.test-output/safari-extension`. It bundles the background module into a nonpersistent background script and leaves Chromium's service-worker manifest unchanged. It does not install anything or establish Safari API compatibility.

With full Xcode installed and your own `SAFARI_BUNDLE_IDENTIFIER` set, run `npm run extension:safari:xcode`. The script finds Apple's packager (or older converter), copies resources and refuses to overwrite an existing generated project. Review all manifest/API warnings. Open the generated project yourself, select your signing team, then build/test macOS and iOS targets. This repository does not choose a signing identity, purchase developer membership, accept agreements or publish an app.

Before shipping: confirm `declarativeNetRequest` session rules, alarms, storage and popup messaging on each minimum supported Safari/iOS version. Test expiry after background suspension/device locking, Stop, relaunch, site permissions, subdomains and private browsing. An unsupported session-rule API must show a failure, never a success claim. Do not replace expiring session rules with persistent blocking rules without a separate expiry/recovery design. No system DND capability is provided.

Apple's packaging instructions: https://developer.apple.com/documentation/safariservices/packaging-a-web-extension-for-safari
