# Publishing updates

- The user has authorized automatic publication of each completed update: describe the changes, run relevant checks, commit with a descriptive message, and push without asking again. A later request to keep work local overrides this authorization.
- Publish only files belonging to the completed update; leave unrelated local changes untouched.
- Before each user-authorized publication, update `src/client/release.json`: use a new version and concise user-facing changes in HY, EN and RU.
- Keep release notes in that single file. The app displays them once per version on the welcome screen.
- Preserve the `history` array in `src/client/release.json`. Before changing the current version, prepend its version, date and HY/EN/RU notes to history if that version is not already present; set the new release date. Never invent missing historical releases.
- Use a Git commit message that names the actual change. Do not claim that background push notifications or emails were sent; release notices appear inside the app.
- Respect any user instruction to keep work local. Updating release notes does not authorize a push.
- Release numbering follows the user's convention: the final component must not exceed 10. After a release ending in .10, increment the major component and restart at .0.1 (for example, 2.11.10 → 3.0.1). Preserve already published version numbers in history; correct the current release to 3.0.1 after the legacy 2.11.19 sequence.
