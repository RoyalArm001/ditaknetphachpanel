# My Patch for Windows

## Deliverables

`../Windows-Release/MyPatch-Setup-2.7.4-x64.exe` installs for the current Windows user and creates Start-menu/desktop shortcuts.
`../Windows-Release/MyPatch-Portable-2.7.4-x64.exe` runs without installation. No Node.js installation is required.

The application opens https://patch.ditaknet.com in its own Windows window, using the same projects, PIN/account access, maps, reports, sharing, themes and languages. Sign in once inside this window; it uses a separate persistent profile from Chrome/Edge. Installation and normal updates do not erase this profile. Cloud access requires internet; browser-local mode and the app shell can work offline after their first successful load. This is not a bundled offline cloud database.

## Updates

Feature updates come from the existing website. The web build emits `asset-manifest.json` with SHA-256 hashes and sections (maps, reports, racks, data, core). The service worker reuses unchanged cached files, verifies changed downloads, and activates the completed update. Existing protection delays reload while a form is open or work is unsaved. Future section code changes require a normal website publication, not a new Windows installer.

The native Electron runtime is separate: update the pinned Electron version, rebuild, and distribute a new installer when runtime/security updates are needed. No native binary update feed is configured. The current binaries are unsigned; production code signing requires the publisher's signing certificate.

## Build

From this folder: `npm ci`, then `npm run build`. The build emits NSIS and portable x64 applications in `../Windows-Release`. The source allowlist includes only the wrapper and icon; it excludes database files, credentials, source-server code, and environment files. The earlier `../desktop` draft is kept separately and is not part of this build.

The remote renderer has no Node integration, preload bridge or filesystem access, and uses context isolation and sandboxing. See https://www.electronjs.org/docs/latest/tutorial/security for the platform guidance used here.
