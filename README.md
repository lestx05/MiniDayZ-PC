# MiniDayZ PC

A reproducible Windows desktop port of **MiniDayZ Plus 1.2**. The game runs locally in a hardened Electron shell and does not require an internet connection after the portable executable has been built.

> This is an unofficial community port. Mini DAYZ and its game assets belong to their respective rights holders; see [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md).

## Current release

- Desktop port: **v0.1.0**
- Game build: **MiniDayZ Plus 1.2**
- Platform: Windows 10/11 x64
- Package: portable `.exe` (no installer required)

Download the newest executable from [GitHub Releases](https://github.com/lestx05/MiniDayZ-PC/releases/latest).

## Controls and desktop behavior

- `F11`: toggle full screen
- `Alt+F4`: close the game
- Launch with `--windowed`: start in a resizable 4:3 window
- Only one instance runs at a time

Game saves use a stable private origin under Electron's `%APPDATA%\MiniDayZ PC` profile, so they persist between launches and desktop-port updates.

## Development

Requirements:

- Node.js 22.12 or newer
- pnpm 11.7.0

```powershell
pnpm install --frozen-lockfile
pnpm start
```

`pnpm start` downloads the pinned upstream MiniDayZ Plus files on first use and verifies the archive's SHA-256 checksum before extracting it. Later runs reuse the verified local copy.

Useful commands:

```powershell
pnpm start:windowed
pnpm verify
pnpm smoke
pnpm build:win
```

The Windows build is written to `release/MiniDayZ-PC-<version>-x64.exe`.

## Reproducible game source

The original upload did not contain the `docs/` game directory referenced by `package.json`. The build restores that directory from the exact upstream commit linked by the original README:

- Repository: `NextDev65/MiniDayZ`
- Commit: `40ac9cf58af806e2d7c1c0638f6c3214042239b7`
- Archive SHA-256: `0b49d59718849c903d370f29fee337b018d35db287a8beec15cdb3ce71058971`

Pinning both the commit and archive checksum prevents future upstream changes from silently changing a release.

## Versioning and releases

The desktop port follows semantic versioning:

- Patch (`0.1.1`): fixes and small optimizations
- Minor (`0.2.0`): new desktop features or meaningful behavior changes
- Major (`1.0.0`): stable release milestone or incompatible changes

Every push to `main` is validated and compiled on a clean Windows runner. The workflow publishes the portable executable and `SHA256SUMS.txt` under the version declared in `package.json`.
