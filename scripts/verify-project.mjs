import { spawnSync } from 'node:child_process';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const gameRoot = path.join(projectRoot, 'docs');

function fail(message) {
  throw new Error(message);
}

async function verifyFile(relativePath, minimumSize = 1) {
  const filePath = path.join(projectRoot, relativePath);
  const fileInfo = await stat(filePath).catch(() => null);
  if (!fileInfo?.isFile() || fileInfo.size < minimumSize) {
    fail(`Missing or incomplete required file: ${relativePath}`);
  }
  return fileInfo;
}

async function countFiles(directory) {
  let total = 0;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    total += entry.isDirectory()
      ? await countFiles(path.join(directory, entry.name))
      : 1;
  }
  return total;
}

for (const sourceFile of ['desktop/main.js', 'desktop/game-protocol.js']) {
  await verifyFile(sourceFile, 100);
  const syntaxCheck = spawnSync(process.execPath, ['--check', path.join(projectRoot, sourceFile)], {
    encoding: 'utf8',
  });
  if (syntaxCheck.status !== 0) {
    fail(`${sourceFile} failed syntax validation:\n${syntaxCheck.stderr}`);
  }
}

await verifyFile('docs/index.html', 1_000);
await verifyFile('docs/c2runtime.js', 100_000);
await verifyFile('docs/data.js', 5_000_000);
await verifyFile('docs/icon-256.png', 1_000);

const packageJson = JSON.parse(await readFile(path.join(projectRoot, 'package.json'), 'utf8'));
if (!/^\d+\.\d+\.\d+$/.test(packageJson.version)) {
  fail(`package.json version is not valid semantic versioning: ${packageJson.version}`);
}
if (packageJson.main !== 'desktop/main.js') {
  fail('package.json must use desktop/main.js as its Electron entry point.');
}

const packagedFiles = new Set(packageJson.build?.files ?? []);
for (const requiredPattern of ['desktop/**/*', 'docs/**/*', 'package.json']) {
  if (!packagedFiles.has(requiredPattern)) {
    fail(`Electron build is missing required files pattern: ${requiredPattern}`);
  }
}

const indexHtml = await readFile(path.join(gameRoot, 'index.html'), 'utf8');
if (!indexHtml.includes('id="c2canvas"') || !indexHtml.includes('c2runtime.js')) {
  fail('docs/index.html is not a recognizable Construct 2 MiniDayZ export.');
}

const gameFileCount = await countFiles(gameRoot);
if (gameFileCount < 1_800) {
  fail(`Game asset set is incomplete: found only ${gameFileCount} files.`);
}

console.log(`Verified MiniDayZ PC v${packageJson.version}: ${gameFileCount} game files are ready.`);
