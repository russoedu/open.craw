# studio-desktop

OpenCraw Studio as a desktop app: one Electron window around the same Studio server and React UI that
`opencraw-studio` runs in a browser tab (issue #96). The server runs inside the app's own process: there is
no second process to start and no port to open by hand.

## Run it

```sh
npm run studio-desktop:start         # builds the app, the Studio server and the UI, then opens the window
npx electron apps/studio-desktop path/to/recipes   # after a build, the same, from any folder
npm run studio-desktop:e2e           # launches the built app and drives its window (needs a display)
```

Chromium for samples and snapshots is installed on first use, as for `opencraw-studio`.

## Package it

```sh
npm run studio-desktop:package        # builds everything, then the installer for this platform in apps/studio-desktop/release
npm run studio-desktop:package:dir    # the unpacked app only (quick, to try it)
```

`packaging/stage-app.mjs` makes `dist-app/`: the bundled main process, the preload and the production
dependencies installed from tarballs of the workspace packages (the app carries exactly what is built here).
`electron-builder.yml` packs that folder: NSIS on Windows, dmg on macOS, AppImage on Linux. **Unsigned**: Windows
will warn and macOS will refuse to open it without a right-click. Files stay outside an archive (`asar: false`)
because Playwright runs its own CLI and reads its own files from disk.

The `desktop-package` workflow builds the three installers when the app changes and starts the unpacked
Linux build once (`e2e/packaged.e2e.test.ts`). It publishes nothing.

## What it does

- **Opens a recipe folder.** `File > Open Folder…` (Ctrl/Cmd+O), `File > Open Recent`, or a folder on the
  command line. With none given it opens the most recent folder that still exists.
- **Picks folders with the native dialog.** In the app the toolbar has "Open folder…" instead of a folder
  box and "Open" (the page asks the main process through the preload; a browser tab keeps the box).
- **Runs hooks.** `--hooks <file>` (or `--plugins`, or `OPENCRAW_PLUGINS`/`OPENCRAW_HOOKS`) loads a hooks or
  plugins module on the launch's own authority, exactly like `opencraw studio --hooks`. A file that fails
  to load stops the app with the reason. A second launch's `--hooks` is ignored: the running server keeps its own.
- **One window, one instance.** A second launch focuses the running window, or opens the folder it was given.
- **Quits cleanly.** Closing the window stops the server, a sample run in progress and a recording.
- **Remembers where it was.** The window reopens at its last size and position (and maximised), unless that
  screen is gone, in which case it opens at the default place.
- **Keeps the page on a short leash.** The page has no Node access (context isolation and the sandbox are on,
  the only preload exposes one call, `chooseFolder()`), only the local Studio server loads in the window, links to the web open in the person's
  browser, and the page is granted no permissions.

## Layout

| Slice | What it holds |
|---|---|
| `src/desktop-launch` | Starts the app: picks the folder, starts the server, shows the window, installs the menu. Everything it touches comes in through `DesktopShell`, so it runs in tests without Electron. |
| `src/electron-shell` | The Electron adapter: the window, the folder dialog, the menu, and the navigation policy. The only code that imports `electron` besides `main.ts`. |
| `src/desktop-bridge` | The one call the page may make: `preload.cjs` (copied next to `main.js` by the build) and its channel name. |
| `src/app-menu` | The menu bar as plain data. |
| `src/window-bounds` | The window's last size and position, the check that it is still on a connected screen, and the JSON file that keeps it. |
| `src/recent-folders` | The recent-folder list and the JSON file in the user-data folder that keeps it. |
| `e2e/` | Launches the built app with Playwright's Electron support. |

## Not done yet

Tracked in issue #96:

- **An embedded live site view** is deliberately not built: Record opens a headed Chromium with its own
  persistent profile (logins in place), and a pick on the snapshot is what the engine will reproduce.
- **Signing and notarisation**, and the **auto-update feed** (installers build unsigned today).
