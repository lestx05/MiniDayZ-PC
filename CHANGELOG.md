# Changelog

All notable desktop-port changes are documented here. The embedded game remains MiniDayZ Plus 1.2.

## [0.1.0] - 2026-07-14

### Added

- Reproducible Windows x64 portable build based on a checksum-verified upstream game snapshot.
- Secure Electron desktop shell with isolated renderer and no Node.js access from game code.
- Stable custom game origin so local saves remain available between launches and versions.
- Full-screen startup, `F11` full-screen toggle, windowed development mode, and single-instance handling.
- Range-aware local asset delivery for reliable audio playback and seeking.
- Automated integrity checks, protocol tests, GitHub Actions builds, checksums, and versioned releases.
