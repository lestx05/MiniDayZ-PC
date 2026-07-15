'use strict';

const assert = require('node:assert/strict');
const { access, mkdtemp, rm, writeFile } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const path = require('node:path');
const test = require('node:test');
const afterPack = require('../scripts/after-pack.cjs');

async function exists(filePath) {
  return access(filePath).then(() => true, () => false);
}

test('removes only the redundant Electron binary from Windows packages', async (context) => {
  const appOutDir = await mkdtemp(path.join(tmpdir(), 'minidayz-after-pack-'));
  context.after(() => rm(appOutDir, { recursive: true, force: true }));
  const productExecutable = path.join(appOutDir, 'MiniDayZ PC.exe');
  const baseExecutable = path.join(appOutDir, 'electron.exe');
  await writeFile(productExecutable, 'product');
  await writeFile(baseExecutable, 'base');

  await afterPack({
    appOutDir,
    electronPlatformName: 'win32',
    packager: { appInfo: { productFilename: 'MiniDayZ PC' } },
  });

  assert.equal(await exists(productExecutable), true);
  assert.equal(await exists(baseExecutable), false);
});

test('does not alter non-Windows packages', async (context) => {
  const appOutDir = await mkdtemp(path.join(tmpdir(), 'minidayz-after-pack-'));
  context.after(() => rm(appOutDir, { recursive: true, force: true }));
  const baseExecutable = path.join(appOutDir, 'electron.exe');
  await writeFile(baseExecutable, 'base');

  await afterPack({ appOutDir, electronPlatformName: 'linux' });

  assert.equal(await exists(baseExecutable), true);
});
