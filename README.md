# Aetherworld

Zero-asset HTML5 canvas fantasy life simulation.

## Play online (GitHub Pages)

After publishing, the game lives at:

`https://<your-username>.github.io/<repo-name>/`

## Publish to GitHub Pages

1. Create a new repo on GitHub (e.g. `aetherworld`).
2. Upload this folder, or push from terminal:

```bash
cd C:\Users\astra\Downloads\WOLRD
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/<your-username>/<repo-name>.git
git push -u origin main
```

3. On GitHub: **Settings → Pages → Build from branch → `main` → `/ (root)` → Save**.
4. Wait ~1 minute, then open your Pages URL.

## Play locally

Double-click `play.bat`, or run:

```bash
npx --yes serve .
```

Then open `http://localhost:3456`.

**Do not** open `index.html` directly — browsers block ES modules on `file://` links.
