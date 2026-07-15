import { copyFile, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  DESKTOP_BINDINGS,
  DESKTOP_CONTROLS_VERSION,
  DESKTOP_EVENT_GROUP,
  DESKTOP_OFFLINE_CACHE_VERSION,
  QUICK_WEAPON_BINDINGS,
  RUNTIME_IDS,
} from './desktop-control-bindings.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const defaultGameRoot = path.join(projectRoot, 'docs');
const controlsSource = path.join(projectRoot, 'desktop', 'game-controls.js');
const INDEX_PATCH_START = '<!-- MiniDayZ PC controls: start -->';
const INDEX_PATCH_END = '<!-- MiniDayZ PC controls: end -->';
const SID_FLOOR = 10_000_000_000_000;

function clone(value) {
  return structuredClone(value);
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

function findEventBySid(value, sid) {
  let found = null;
  visitArrays(value, (entry) => {
    if (!found && entry[0] === 0 && entry.length === 8 && entry[4] === sid) {
      found = entry;
    }
  });
  return found;
}

function referencesObject(condition, objectId) {
  let found = false;
  visitArrays(condition, (entry) => {
    if (entry.length === 2 && entry[0] === 4 && entry[1] === objectId) {
      found = true;
    }
  });
  return found;
}

export function createSidAllocator(project) {
  const used = new Set();
  visitArrays(project, (entry) => {
    for (const value of entry) {
      if (typeof value === 'number' && Number.isInteger(value) && value >= SID_FLOOR) {
        used.add(value);
      }
    }
  });

  let candidate = 98_000_000_000_000;
  return () => {
    while (used.has(candidate)) {
      candidate += 1;
    }
    const sid = candidate;
    used.add(sid);
    candidate += 1;
    return sid;
  };
}

function remapLargeIds(value, allocateSid, replacements = new Map()) {
  if (!Array.isArray(value)) {
    return;
  }

  for (let index = 0; index < value.length; index += 1) {
    const entry = value[index];
    if (typeof entry === 'number' && Number.isInteger(entry) && entry >= SID_FLOOR) {
      if (!replacements.has(entry)) {
        replacements.set(entry, allocateSid());
      }
      value[index] = replacements.get(entry);
    } else {
      remapLargeIds(entry, allocateSid, replacements);
    }
  }
}

function keyboardCondition(keyCode, mode, allocateSid) {
  const isPressed = mode === 'pressed';
  return [
    RUNTIME_IDS.keyboardPlugin,
    isPressed ? RUNTIME_IDS.keyPressedCondition : RUNTIME_IDS.keyDownCondition,
    null,
    isPressed ? 1 : 0,
    false,
    false,
    false,
    allocateSid(),
    false,
    [[9, keyCode]],
  ];
}

export function cloneTouchEventForKeyboard(sourceEvent, binding, allocateSid) {
  const event = clone(sourceEvent);
  remapLargeIds(event, allocateSid);

  const conditionIndex = event[5].findIndex((condition) => (
    condition?.[0] === RUNTIME_IDS.touchPlugin
    && condition?.[1] === binding.touchConditionId
    && referencesObject(condition, binding.touchObjectId)
  ));

  if (conditionIndex === -1) {
    throw new Error(`Could not find the touch condition for desktop binding ${binding.id}.`);
  }

  event[5][conditionIndex] = keyboardCondition(binding.keyCode, binding.mode, allocateSid);
  return event;
}

function createFunctionBindingEvent(binding, allocateSid) {
  return [
    0,
    null,
    false,
    null,
    allocateSid(),
    [keyboardCondition(binding.keyCode, 'pressed', allocateSid)],
    [[
      RUNTIME_IDS.functionPlugin,
      69,
      null,
      allocateSid(),
      false,
      [[1, [2, binding.functionName]], [13]],
    ]],
    [],
  ];
}

function groupActionName(entry) {
  if (entry?.[0] !== -1 || entry?.[1] !== 74) {
    return null;
  }
  return entry?.[5]?.[0]?.[1]?.[1] ?? null;
}

function enforceDesktopMovement(project) {
  const stats = {
    controlDefaults: 0,
    controlWrites: 0,
    groupDefaults: 0,
    groupWrites: 0,
    storageWrites: 0,
  };

  visitArrays(project, (entry) => {
    if (entry[0] === 1 && entry[1] === 'GUI_control_type') {
      entry[3] = 2;
      stats.controlDefaults += 1;
    }

    if (
      entry[0] === 0
      && Array.isArray(entry[1])
      && ['Movement_wasd', 'Movement_stick', 'Movement_tap'].includes(entry[1][1])
    ) {
      entry[1][0] = entry[1][1] === 'Movement_wasd';
      stats.groupDefaults += 1;
    }

    const groupName = groupActionName(entry);
    if (groupName === 'Movement_wasd') {
      entry[5][1] = [3, 1];
      stats.groupWrites += 1;
    } else if (groupName === 'Movement_stick' || groupName === 'Movement_tap') {
      entry[5][1] = [3, 0];
      stats.groupWrites += 1;
    }

    if (
      entry[0] === -1
      && entry[1] === 41
      && entry?.[5]?.[0]?.[0] === 11
      && entry?.[5]?.[0]?.[1] === 'GUI_control_type'
    ) {
      entry[5][1] = [7, [0, 2]];
      stats.controlWrites += 1;
    }

    if (
      entry[0] === 422
      && entry[1] === 146
      && entry?.[5]?.[0]?.[1]?.[1] === 'CONTROLS'
    ) {
      entry[5][1] = [7, [2, 'WASD']];
      stats.storageWrites += 1;
    }
  });

  if (
    stats.controlDefaults < 1
    || stats.controlWrites < 1
    || stats.groupDefaults < 3
    || stats.groupWrites < 3
    || stats.storageWrites < 1
  ) {
    throw new Error(`The pinned game control structure changed unexpectedly: ${JSON.stringify(stats)}.`);
  }

  return stats;
}

export function applyDesktopControlsToProject(project) {
  const eventSheets = project?.[6];
  const gameEventSheet = eventSheets?.find((sheet) => sheet?.[0] === 'Game_events');
  if (!gameEventSheet || !Array.isArray(gameEventSheet[1])) {
    throw new Error('Could not find the MiniDayZ Game_events sheet.');
  }

  gameEventSheet[1] = gameEventSheet[1].filter((entry) => !(
    entry?.[0] === 0
    && Array.isArray(entry[1])
    && entry[1][1] === DESKTOP_EVENT_GROUP
  ));

  const movementStats = enforceDesktopMovement(project);
  const allocateSid = createSidAllocator(project);
  const bindingEvents = DESKTOP_BINDINGS.map((binding) => {
    const sourceEvent = findEventBySid(gameEventSheet, binding.sourceEventSid);
    if (!sourceEvent) {
      throw new Error(`Could not find source event ${binding.sourceEventSid} for ${binding.id}.`);
    }
    return cloneTouchEventForKeyboard(sourceEvent, binding, allocateSid);
  });

  bindingEvents.push(...QUICK_WEAPON_BINDINGS.map((binding) => (
    createFunctionBindingEvent(binding, allocateSid)
  )));

  const groupSid = allocateSid();
  gameEventSheet[1].push([
    0,
    [true, DESKTOP_EVENT_GROUP],
    false,
    null,
    groupSid,
    [[
      -1,
      38,
      null,
      0,
      false,
      false,
      false,
      groupSid,
      false,
      [[1, [2, DESKTOP_EVENT_GROUP]]],
    ]],
    [],
    bindingEvents,
  ]);

  return {
    bindingCount: bindingEvents.length,
    movement: movementStats,
  };
}

function patchIndexHtml(indexHtml) {
  const patchPattern = new RegExp(
    `\\r?\\n\\r?\\n[\\t ]*${INDEX_PATCH_START}[\\s\\S]*?${INDEX_PATCH_END}`,
    'g',
  );
  const cleanHtml = indexHtml.replace(patchPattern, '');
  const runtimeScript = '<script src="c2runtime.js"></script>';
  if (!cleanHtml.includes(runtimeScript)) {
    throw new Error('Could not locate c2runtime.js in the pinned game index.');
  }

  const patchBlock = [
    INDEX_PATCH_START,
    '\t<script src="desktop-controls.js"></script>',
    `\t${INDEX_PATCH_END}`,
  ].join('\n');
  return cleanHtml.replace(runtimeScript, `${runtimeScript}\n\n\t${patchBlock}`);
}

async function patchDataFile(gameRoot) {
  const dataPath = path.join(gameRoot, 'data.js');
  const temporaryPath = `${dataPath}.desktop-patch`;
  const source = await readFile(dataPath, 'utf8');
  const hasBom = source.charCodeAt(0) === 0xFEFF;
  const data = JSON.parse(hasBom ? source.slice(1) : source);
  const stats = applyDesktopControlsToProject(data.project);
  const output = `${hasBom ? '\uFEFF' : ''}${JSON.stringify(data)}`;

  await rm(temporaryPath, { force: true });
  await writeFile(temporaryPath, output, 'utf8');
  await rename(temporaryPath, dataPath);
  return stats;
}

async function patchOfflineManifest(gameRoot) {
  const offlinePath = path.join(gameRoot, 'offline.js');
  const source = await readFile(offlinePath, 'utf8');
  const hasBom = source.charCodeAt(0) === 0xFEFF;
  const manifest = JSON.parse(hasBom ? source.slice(1) : source);
  const desktopFiles = ['desktop-controls.js', '.minidayz-desktop-patch.json'];

  manifest.version = DESKTOP_OFFLINE_CACHE_VERSION;
  manifest.fileList = [
    ...manifest.fileList.filter((entry) => !desktopFiles.includes(entry)),
    ...desktopFiles,
  ];
  await writeFile(
    offlinePath,
    `${hasBom ? '\uFEFF' : ''}${JSON.stringify(manifest, null, '\t')}\n`,
    'utf8',
  );
}

export async function applyDesktopGamePatches(gameRoot = defaultGameRoot) {
  const stats = await patchDataFile(gameRoot);
  const indexPath = path.join(gameRoot, 'index.html');
  const indexHtml = await readFile(indexPath, 'utf8');
  await writeFile(indexPath, patchIndexHtml(indexHtml), 'utf8');
  await copyFile(controlsSource, path.join(gameRoot, 'desktop-controls.js'));

  const metadata = {
    version: DESKTOP_CONTROLS_VERSION,
    eventGroup: DESKTOP_EVENT_GROUP,
    bindingCount: stats.bindingCount,
    bindings: [
      ...DESKTOP_BINDINGS.map(({ id, key, mode }) => ({ id, key, mode })),
      ...QUICK_WEAPON_BINDINGS.map(({ id, key }) => ({ id, key, mode: 'pressed' })),
    ],
    movement: 'WASD',
    offlineCacheVersion: DESKTOP_OFFLINE_CACHE_VERSION,
  };
  await writeFile(
    path.join(gameRoot, '.minidayz-desktop-patch.json'),
    `${JSON.stringify(metadata, null, 2)}\n`,
    'utf8',
  );
  await patchOfflineManifest(gameRoot);

  return metadata;
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) {
  const metadata = await applyDesktopGamePatches();
  console.log(`Applied MiniDayZ PC controls ${metadata.version} (${metadata.bindingCount} bindings).`);
}
