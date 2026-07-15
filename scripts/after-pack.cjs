'use strict';

const { access, rm } = require('node:fs/promises');
const path = require('node:path');

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') {
    return;
  }

  const productExecutable = path.join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.exe`,
  );
  const baseExecutable = path.join(context.appOutDir, 'electron.exe');

  if (
    productExecutable.toLowerCase() !== baseExecutable.toLowerCase()
    && await exists(productExecutable)
    && await exists(baseExecutable)
  ) {
    await rm(baseExecutable);
    console.log('Removed redundant electron.exe from the Windows package.');
  }
}

module.exports = afterPack;
module.exports.afterPack = afterPack;
module.exports.default = afterPack;
