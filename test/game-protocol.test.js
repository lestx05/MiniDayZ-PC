'use strict';

const assert = require('node:assert/strict');
const { mkdtemp, rm, writeFile } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  contentTypeFor,
  createAssetResponse,
  parseByteRange,
  resolveGameAsset,
} = require('../desktop/game-protocol');

const gameRoot = path.resolve('/tmp/minidayz-game');

test('maps the game root to index.html', () => {
  assert.equal(
    resolveGameAsset(gameRoot, 'minidayz://app/'),
    path.join(gameRoot, 'index.html'),
  );
});

test('resolves normal assets inside the game root', () => {
  assert.equal(
    resolveGameAsset(gameRoot, 'minidayz://app/media/ambient.ogg?cache=1'),
    path.join(gameRoot, 'media', 'ambient.ogg'),
  );
});

test('rejects other origins and encoded traversal attempts', () => {
  assert.equal(resolveGameAsset(gameRoot, 'https://example.com/index.html'), null);
  assert.equal(resolveGameAsset(gameRoot, 'minidayz://other/index.html'), null);
  assert.equal(resolveGameAsset(gameRoot, 'minidayz://app/%2e%2e%2fsecret.txt'), null);
  assert.equal(resolveGameAsset(gameRoot, 'minidayz://app/..%5csecret.txt'), null);
});

test('parses standard and suffix byte ranges', () => {
  assert.deepEqual(parseByteRange('bytes=0-99', 1_000), { start: 0, end: 99 });
  assert.deepEqual(parseByteRange('bytes=900-', 1_000), { start: 900, end: 999 });
  assert.deepEqual(parseByteRange('bytes=-100', 1_000), { start: 900, end: 999 });
  assert.deepEqual(parseByteRange('bytes=0-5000', 1_000), { start: 0, end: 999 });
  assert.equal(parseByteRange(undefined, 1_000), undefined);
});

test('rejects malformed or unsatisfiable byte ranges', () => {
  assert.equal(parseByteRange('items=0-10', 1_000), null);
  assert.equal(parseByteRange('bytes=1000-', 1_000), null);
  assert.equal(parseByteRange('bytes=20-10', 1_000), null);
  assert.equal(parseByteRange('bytes=0-1,5-6', 1_000), null);
});

test('provides media types required by the Construct 2 export', () => {
  assert.equal(contentTypeFor('index.html'), 'text/html; charset=utf-8');
  assert.equal(contentTypeFor('sound.ogg'), 'audio/ogg');
  assert.equal(contentTypeFor('sound.m4a'), 'audio/mp4');
  assert.equal(contentTypeFor('bunker_json'), 'application/octet-stream');
});

test('serves complete and ranged local assets', async (context) => {
  const temporaryRoot = await mkdtemp(path.join(tmpdir(), 'minidayz-protocol-test-'));
  context.after(() => rm(temporaryRoot, { recursive: true, force: true }));
  await writeFile(path.join(temporaryRoot, 'sample.ogg'), '0123456789', 'utf8');

  const fullResponse = await createAssetResponse(
    temporaryRoot,
    new Request('minidayz://app/sample.ogg'),
  );
  assert.equal(fullResponse.status, 200);
  assert.equal(fullResponse.headers.get('content-type'), 'audio/ogg');
  assert.equal(await fullResponse.text(), '0123456789');

  const rangeResponse = await createAssetResponse(
    temporaryRoot,
    new Request('minidayz://app/sample.ogg', { headers: { Range: 'bytes=2-5' } }),
  );
  assert.equal(rangeResponse.status, 206);
  assert.equal(rangeResponse.headers.get('content-range'), 'bytes 2-5/10');
  assert.equal(await rangeResponse.text(), '2345');
});

test('returns safe errors for missing assets and unsupported methods', async () => {
  const missingResponse = await createAssetResponse(
    gameRoot,
    new Request('minidayz://app/missing.png'),
  );
  assert.equal(missingResponse.status, 404);

  const methodResponse = await createAssetResponse(
    gameRoot,
    new Request('minidayz://app/index.html', { method: 'POST' }),
  );
  assert.equal(methodResponse.status, 405);
});
