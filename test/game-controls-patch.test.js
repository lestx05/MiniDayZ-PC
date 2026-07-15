'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

test('clones a guarded touch action as a keyboard action without mutating its source', async () => {
  const { cloneTouchEventForKeyboard } = await import('../scripts/patch-game-assets.mjs');
  const source = [
    0,
    null,
    false,
    null,
    47_060_904_387_293,
    [[495, 273, null, 1, false, false, false, 47_060_904_387_294, false, [[4, 497]]]],
    [[-1, 41, null, 47_060_904_387_295, false, [[11, 'Inventory_open'], [7, [0, 1]]]]],
    [],
  ];
  const sourceSnapshot = structuredClone(source);
  let nextSid = 98_000_000_001_000;
  const cloned = cloneTouchEventForKeyboard(source, {
    id: 'inventory',
    keyCode: 9,
    mode: 'pressed',
    touchConditionId: 273,
    touchObjectId: 497,
  }, () => nextSid++);

  assert.deepEqual(source, sourceSnapshot);
  assert.notEqual(cloned[4], source[4]);
  assert.deepEqual(cloned[5][0].slice(0, 4), [180, 453, null, 1]);
  assert.deepEqual(cloned[5][0][9], [[9, 9]]);
  assert.notEqual(cloned[6][0][3], source[6][0][3]);
});

test('uses the continuous keyboard condition for held actions', async () => {
  const { cloneTouchEventForKeyboard } = await import('../scripts/patch-game-assets.mjs');
  const source = [
    0,
    null,
    false,
    null,
    47_060_904_387_296,
    [[495, 274, null, 1, false, false, false, 47_060_904_387_297, false, [[4, 505]]]],
    [],
    [],
  ];
  let nextSid = 98_000_000_002_000;
  const cloned = cloneTouchEventForKeyboard(source, {
    id: 'primary-hold',
    keyCode: 32,
    mode: 'down',
    touchConditionId: 274,
    touchObjectId: 505,
  }, () => nextSid++);

  assert.deepEqual(cloned[5][0].slice(0, 4), [180, 305, null, 0]);
  assert.deepEqual(cloned[5][0][9], [[9, 32]]);
});
