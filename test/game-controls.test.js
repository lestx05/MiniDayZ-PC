'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const controls = require('../desktop/game-controls');

class FakeKeyboardEvent extends Event {
  constructor(type, options = {}) {
    super(type, options);
    this.code = options.code ?? '';
    this.key = options.key ?? '';
    this.repeat = options.repeat ?? false;
  }
}

function createFakeWindow() {
  const document = new EventTarget();
  document.closest = (selector) => (
    selector === '#c2canvas, #c2canvasdiv' ? document : null
  );
  return { document, KeyboardEvent: FakeKeyboardEvent };
}

test('publishes the complete v0.2.0 desktop-control manifest', () => {
  assert.equal(controls.VERSION, '0.2.0');
  assert.equal(controls.PATCH_BINDING_COUNT, 17);
  assert.equal(controls.ARROW_ALIASES.ArrowUp.keyCode, 87);
  assert.equal(controls.MOUSE_ALIASES[2].keyCode, 88);
  assert.ok(controls.HELP_ROWS.some(([key]) => key === 'Tab'));
});

test('turns arrow input into Construct-compatible WASD keyboard events', () => {
  const windowObject = createFakeWindow();
  controls.install(windowObject);
  const received = [];
  windowObject.document.addEventListener('keydown', (event) => {
    received.push({ key: event.key, which: event.which });
  });

  const arrowEvent = new FakeKeyboardEvent('keydown', {
    bubbles: true,
    cancelable: true,
    key: 'ArrowUp',
  });
  windowObject.document.dispatchEvent(arrowEvent);

  assert.equal(arrowEvent.defaultPrevented, true);
  assert.deepEqual(received, [
    { key: 'w', which: 87 },
    { key: 'ArrowUp', which: undefined },
  ]);
});

test('maps right-click to the aim key without replacing left-click', () => {
  const windowObject = createFakeWindow();
  controls.install(windowObject);
  const received = [];
  windowObject.document.addEventListener('keydown', (event) => received.push(event.which));

  const rightClick = new Event('mousedown', { bubbles: true, cancelable: true });
  Object.defineProperty(rightClick, 'button', { value: 2 });
  windowObject.document.dispatchEvent(rightClick);

  const leftClick = new Event('mousedown', { bubbles: true, cancelable: true });
  Object.defineProperty(leftClick, 'button', { value: 0 });
  windowObject.document.dispatchEvent(leftClick);

  assert.equal(rightClick.defaultPrevented, true);
  assert.equal(leftClick.defaultPrevented, false);
  assert.deepEqual(received, [88]);
});
