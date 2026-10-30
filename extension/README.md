# Optional Study Room Focus Blocker

Chrome/Edge desktop, Manifest V3. This is an unpacked developer release, not a published Web Store extension. Installing and granting permissions is your choice and must be done by you.

1. Download the ZIP from Study Room → Protect your focus and extract it.
2. Open chrome://extensions (or edge://extensions), enable Developer mode, choose Load unpacked and select the extracted folder containing manifest.json.
3. Review the requested blocking/storage/alarm permissions. No host/content/history/tabs permissions or content scripts are requested.
4. Open the extension popup, enter 1–50 domain names and 1–180 minutes, and press Start blocking.
5. Stop blocking at any time from its popup; disabling/removing the extension also stops it.

The extension blocks top-level HTTP/HTTPS page loads with declarative rules, including subdomains. It does not read website content, browsing history or credentials, send telemetry, silence system notifications, control other browsers or guarantee already-playing media stops. Study Room's own host and parent domains cannot be blocked. Rules expire via an alarm, are checked on worker wakeup, and are cleared on browser startup/update. The Study Room website neither installs it nor claims its state is active. Timers and blocking are deliberately started separately. Safari/mobile installation is not supported by this package.

Source is included. Packaging is reproducible with `node scripts/package-focus-extension.mjs` from the repository root.
