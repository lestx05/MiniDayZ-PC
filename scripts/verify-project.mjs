import { spawnSync } from 'node:child_process';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DESKTOP_BINDINGS,
  DESKTOP_CONTROLS_VERSION,
  DESKTOP_EVENT_GROUP,
  DESKTOP_OFFLINE_CACHE_VERSION,
  QUICK_WEAPON_BINDINGS,
  RUNTIME_IDS,
} from './desktop-control-bindings.mjs';

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

function visitArrays(value, callback) {
  if (!Array.isArray(value)) {
    return;
  }
  callback(value);
  for (const entry of value) {
    visitArrays(entry, callback);
  }
}

function countOccurrences(source, fragment) {
  return source.split(fragment).length - 1;
}

const syntaxCheckedFiles = [
  'desktop/main.js',
  'desktop/game-controls.js',
  'desktop/game-protocol.js',
  'scripts/desktop-control-bindings.mjs',
  'scripts/after-pack.cjs',
  'scripts/patch-game-assets.mjs',
  'scripts/sync-game-assets.mjs',
];
for (const sourceFile of syntaxCheckedFiles) {
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
await verifyFile('docs/desktop-controls.js', 1_000);
await verifyFile('docs/.minidayz-desktop-patch.json', 100);

const packageJson = JSON.parse(await readFile(path.join(projectRoot, 'package.json'), 'utf8'));
if (!/^\d+\.\d+\.\d+$/.test(packageJson.version)) {
  fail(`package.json version is not valid semantic versioning: ${packageJson.version}`);
}
if (packageJson.main !== 'desktop/main.js') {
  fail('package.json must use desktop/main.js as its Electron entry point.');
}
if (packageJson.version !== DESKTOP_CONTROLS_VERSION) {
  fail(`Package ${packageJson.version} and control patch ${DESKTOP_CONTROLS_VERSION} versions differ.`);
}
if (
  packageJson.build?.afterPack !== './scripts/after-pack.cjs'
  || packageJson.build?.afterSign !== './scripts/after-pack.cjs'
) {
  fail('Electron builds must run the Windows package cleanup hook.');
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
if (
  countOccurrences(indexHtml, '<script src="desktop-controls.js"></script>') !== 1
  || countOccurrences(indexHtml, '<!-- MiniDayZ PC controls: start -->') !== 1
) {
  fail('docs/index.html must load exactly one copy of the MiniDayZ PC controls bridge.');
}

const controlSource = await readFile(path.join(projectRoot, 'desktop', 'game-controls.js'), 'utf8');
const embeddedControlSource = await readFile(path.join(gameRoot, 'desktop-controls.js'), 'utf8');
if (embeddedControlSource !== controlSource) {
  fail('The embedded desktop controls do not match desktop/game-controls.js.');
}

const patchMetadata = JSON.parse(
  await readFile(path.join(gameRoot, '.minidayz-desktop-patch.json'), 'utf8'),
);
const expectedBindings = [...DESKTOP_BINDINGS, ...QUICK_WEAPON_BINDINGS];
if (
  patchMetadata.version !== DESKTOP_CONTROLS_VERSION
  || patchMetadata.eventGroup !== DESKTOP_EVENT_GROUP
  || patchMetadata.bindingCount !== expectedBindings.length
  || patchMetadata.movement !== 'WASD'
  || patchMetadata.offlineCacheVersion !== DESKTOP_OFFLINE_CACHE_VERSION
) {
  fail(`Desktop patch metadata is inconsistent: ${JSON.stringify(patchMetadata)}.`);
}

const offlineSource = await readFile(path.join(gameRoot, 'offline.js'), 'utf8');
const offlineManifest = JSON.parse(
  offlineSource.charCodeAt(0) === 0xFEFF ? offlineSource.slice(1) : offlineSource,
);
if (
  offlineManifest.version !== DESKTOP_OFFLINE_CACHE_VERSION
  || !offlineManifest.fileList.includes('desktop-controls.js')
  || !offlineManifest.fileList.includes('.minidayz-desktop-patch.json')
) {
  fail('The Construct 2 offline manifest does not include the current desktop patch.');
}

const dataSource = await readFile(path.join(gameRoot, 'data.js'), 'utf8');
const gameData = JSON.parse(dataSource.charCodeAt(0) === 0xFEFF ? dataSource.slice(1) : dataSource);
const gameEventSheet = gameData.project?.[6]?.find((sheet) => sheet?.[0] === 'Game_events');
const desktopGroups = gameEventSheet?.[1]?.filter((entry) => (
  entry?.[0] === 0 && entry?.[1]?.[1] === DESKTOP_EVENT_GROUP
)) ?? [];
if (desktopGroups.length !== 1 || desktopGroups[0][1][0] !== true) {
  fail(`Expected exactly one active ${DESKTOP_EVENT_GROUP} event group.`);
}

const desktopEvents = desktopGroups[0][7];
if (desktopEvents.length !== expectedBindings.length) {
  fail(`Expected ${expectedBindings.length} desktop events, found ${desktopEvents.length}.`);
}

const actualBindingSignatures = desktopEvents.map((event) => {
  const condition = event?.[5]?.find((entry) => (
    entry?.[0] === RUNTIME_IDS.keyboardPlugin
    && [RUNTIME_IDS.keyDownCondition, RUNTIME_IDS.keyPressedCondition].includes(entry?.[1])
  ));
  if (!condition) {
    fail('A desktop event does not have a direct keyboard condition.');
  }
  const mode = condition[1] === RUNTIME_IDS.keyPressedCondition ? 'pressed' : 'down';
  return `${condition?.[9]?.[0]?.[1]}:${mode}`;
}).sort();
const expectedBindingSignatures = expectedBindings.map((binding) => (
  `${binding.keyCode}:${binding.mode ?? 'pressed'}`
)).sort();
if (JSON.stringify(actualBindingSignatures) !== JSON.stringify(expectedBindingSignatures)) {
  fail(`Injected keyboard bindings differ from the manifest: ${actualBindingSignatures.join(', ')}.`);
}

const movementGroups = new Map();
visitArrays(gameData.project, (entry) => {
  if (
    entry?.[0] === 0
    && Array.isArray(entry?.[1])
    && ['Movement_wasd', 'Movement_stick', 'Movement_tap'].includes(entry[1][1])
  ) {
    movementGroups.set(entry[1][1], entry[1][0]);
  }
});
if (
  movementGroups.get('Movement_wasd') !== true
  || movementGroups.get('Movement_stick') !== false
  || movementGroups.get('Movement_tap') !== false
) {
  fail(`Desktop movement groups are not locked to WASD: ${JSON.stringify(Object.fromEntries(movementGroups))}.`);
}

const gameFileCount = await countFiles(gameRoot);
if (gameFileCount < 1_800) {
  fail(`Game asset set is incomplete: found only ${gameFileCount} files.`);
}

console.log(
  `Verified MiniDayZ PC v${packageJson.version}: ${expectedBindings.length} desktop bindings and ${gameFileCount} game files are ready.`,
);
