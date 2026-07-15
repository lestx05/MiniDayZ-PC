import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import {
  access,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import extract from 'extract-zip';
import { applyDesktopGamePatches } from './patch-game-assets.mjs';

const UPSTREAM_REPOSITORY = 'NextDev65/MiniDayZ';
const UPSTREAM_COMMIT = '40ac9cf58af806e2d7c1c0638f6c3214042239b7';
const ARCHIVE_SHA256 = '0b49d59718849c903d370f29fee337b018d35db287a8beec15cdb3ce71058971';
const ARCHIVE_URL = `https://codeload.github.com/${UPSTREAM_REPOSITORY}/zip/${UPSTREAM_COMMIT}`;

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const gameDirectory = path.join(projectRoot, 'docs');
const cacheDirectory = path.join(projectRoot, '.cache', 'minidayz');
const archivePath = path.join(cacheDirectory, `${UPSTREAM_COMMIT}.zip`);
const force = process.argv.includes('--force');

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function hasCompleteGame(directory) {
  const required = [
    ['index.html', 1_000],
    ['c2runtime.js', 100_000],
    ['data.js', 5_000_000],
    ['icon-256.png', 1_000],
  ];

  for (const [relativePath, minimumSize] of required) {
    try {
      const fileInfo = await stat(path.join(directory, relativePath));
      if (!fileInfo.isFile() || fileInfo.size < minimumSize) {
        return false;
      }
    } catch {
      return false;
    }
  }

  return true;
}

async function sha256(filePath) {
  const hash = createHash('sha256');
  await pipeline(createReadStream(filePath), hash);
  return hash.digest('hex');
}

async function downloadArchive() {
  await mkdir(cacheDirectory, { recursive: true });

  if (await exists(archivePath)) {
    const cachedHash = await sha256(archivePath);
    if (cachedHash === ARCHIVE_SHA256) {
      console.log(`Using verified cached game archive (${UPSTREAM_COMMIT.slice(0, 8)}).`);
      return;
    }
    await rm(archivePath, { force: true });
  }

  const partialPath = `${archivePath}.partial`;
  await rm(partialPath, { force: true });

  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      console.log(`Downloading pinned MiniDayZ Plus assets (attempt ${attempt}/3)...`);
      const response = await fetch(ARCHIVE_URL, {
        headers: { 'User-Agent': 'MiniDayZ-PC-build' },
        redirect: 'follow',
        signal: AbortSignal.timeout(120_000),
      });

      if (!response.ok || !response.body) {
        throw new Error(`Download failed with HTTP ${response.status}.`);
      }

      await pipeline(Readable.fromWeb(response.body), createWriteStream(partialPath));
      const downloadedHash = await sha256(partialPath);
      if (downloadedHash !== ARCHIVE_SHA256) {
        throw new Error(`Archive checksum mismatch: received ${downloadedHash}.`);
      }

      await rename(partialPath, archivePath);
      return;
    } catch (error) {
      lastError = error;
      await rm(partialPath, { force: true });
    }
  }

  throw lastError;
}

async function syncGame() {
  if (!force && await hasCompleteGame(gameDirectory)) {
    console.log('MiniDayZ Plus game assets are already present.');
    const patch = await applyDesktopGamePatches(gameDirectory);
    console.log(`Applied MiniDayZ PC controls ${patch.version} (${patch.bindingCount} bindings).`);
    return;
  }

  await downloadArchive();
  const temporaryDirectory = await mkdtemp(path.join(tmpdir(), 'minidayz-pc-'));
  const extractionDirectory = path.join(temporaryDirectory, 'archive');
  const nextGameDirectory = path.join(projectRoot, 'docs.next');

  try {
    await mkdir(extractionDirectory, { recursive: true });
    await extract(archivePath, { dir: extractionDirectory });

    const sourceDirectory = path.join(
      extractionDirectory,
      `MiniDayZ-${UPSTREAM_COMMIT}`,
      'docs',
    );

    if (!await hasCompleteGame(sourceDirectory)) {
      throw new Error('The verified upstream archive does not contain a complete docs build.');
    }

    await rm(nextGameDirectory, { recursive: true, force: true });
    await cp(sourceDirectory, nextGameDirectory, { recursive: true });
    await writeFile(
      path.join(nextGameDirectory, '.minidayz-source.json'),
      `${JSON.stringify({
        repository: UPSTREAM_REPOSITORY,
        commit: UPSTREAM_COMMIT,
        archiveSha256: ARCHIVE_SHA256,
      }, null, 2)}\n`,
      'utf8',
    );

    await rm(gameDirectory, { recursive: true, force: true });
    await rename(nextGameDirectory, gameDirectory);
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
    await rm(nextGameDirectory, { recursive: true, force: true });
  }

  const sourceRecord = JSON.parse(
    await readFile(path.join(gameDirectory, '.minidayz-source.json'), 'utf8'),
  );
  console.log(`Synced MiniDayZ Plus from ${sourceRecord.repository}@${sourceRecord.commit.slice(0, 8)}.`);
  const patch = await applyDesktopGamePatches(gameDirectory);
  console.log(`Applied MiniDayZ PC controls ${patch.version} (${patch.bindingCount} bindings).`);
}

await syncGame();
