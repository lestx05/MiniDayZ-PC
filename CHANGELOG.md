# Changelog

All notable desktop-port changes are documented here. The embedded game remains MiniDayZ Plus 1.2.

## [0.2.0] - 2026-07-14

### Added

- Complete desktop action bindings: WASD and arrow movement, inventory, interaction, combat, reload, weapon selection, aiming, perks, flare, talk, pause, and vehicle actions.
- Mouse aliases for aiming, cycling weapons, and interaction while preserving the game's original left-click behavior.
- An in-game `F1` controls card.
- Deterministic patching of the pinned Construct 2 event sheet by cloning the original guarded touch actions as keyboard actions.
- Automated checks for every injected binding, forced WASD mode, patch metadata, and renderer-side control installation.

### Changed

- Desktop builds now force the native MiniDayZ WASD movement group and remember `WASD` as the selected control scheme.
- Legacy Construct 2 service-worker caches are cleared without touching save storage, preventing older embedded game data from shadowing a desktop update.
- Windows packaging removes a redundant base `electron.exe` when cross-building, reducing the portable executable without changing runtime files.

## [0.1.0] - 2026-07-14

### Added

- Reproducible Windows x64 portable build based on a checksum-verified upstream game snapshot.
- Secure Electron desktop shell with isolated renderer and no Node.js access from game code.
- Stable custom game origin so local saves remain available between launches and versions.
- Full-screen startup, `F11` full-screen toggle, windowed development mode, and single-instance handling.
- Range-aware local asset delivery for reliable audio playback and seeking.
- Automated integrity checks, protocol tests, GitHub Actions builds, checksums, and versioned releases.
