'use strict';

(function createDesktopControls(root, factory) {
  const api = factory();

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }

  if (root?.document) {
    root.MiniDayZPCControls = api;
    api.install(root);
  }
}(typeof globalThis === 'undefined' ? this : globalThis, () => {
  const VERSION = '0.2.0';
  const PATCH_BINDING_COUNT = 17;
  const ARROW_ALIASES = Object.freeze({
    ArrowDown: { code: 'KeyS', key: 's', keyCode: 83 },
    ArrowLeft: { code: 'KeyA', key: 'a', keyCode: 65 },
    ArrowRight: { code: 'KeyD', key: 'd', keyCode: 68 },
    ArrowUp: { code: 'KeyW', key: 'w', keyCode: 87 },
  });
  const MOUSE_ALIASES = Object.freeze({
    1: { code: 'KeyQ', key: 'q', keyCode: 81 },
    2: { code: 'KeyX', key: 'x', keyCode: 88 },
    3: { code: 'KeyQ', key: 'q', keyCode: 81 },
    4: { code: 'KeyE', key: 'e', keyCode: 69 },
  });
  const PREVENTED_KEYS = new Set([
    ' ', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'Tab',
  ]);
  const HELP_ROWS = Object.freeze([
    ['WASD / flechas', 'Moverse o conducir'],
    ['Espacio', 'Atacar / disparar'],
    ['F', 'Ataque alternativo'],
    ['E', 'Interactuar, recoger o salir del vehículo'],
    ['R', 'Recargar'],
    ['Q / botón central', 'Cambiar de arma'],
    ['1 / 2 / 3', 'Cuerpo a cuerpo / arma principal / pistola'],
    ['Tab', 'Abrir o cerrar inventario'],
    ['X / clic derecho', 'Activar o desactivar apuntado'],
    ['P', 'Ventana de ventajas y estado'],
    ['G', 'Usar bengala equipada'],
    ['T', 'Hablar'],
    ['Esc', 'Pausa y opciones'],
    ['F11', 'Pantalla completa'],
    ['F1', 'Mostrar u ocultar esta ayuda'],
  ]);

  function isTypingTarget(target) {
    const tagName = target?.tagName?.toLowerCase();
    return target?.isContentEditable || tagName === 'input' || tagName === 'select' || tagName === 'textarea';
  }

  function createKeyboardEvent(windowObject, type, binding, repeat = false) {
    const event = new windowObject.KeyboardEvent(type, {
      bubbles: true,
      cancelable: true,
      code: binding.code,
      key: binding.key,
      repeat,
    });
    Object.defineProperties(event, {
      keyCode: { configurable: true, get: () => binding.keyCode },
      which: { configurable: true, get: () => binding.keyCode },
    });
    return event;
  }

  function dispatchKeyboard(windowObject, type, binding, repeat = false) {
    windowObject.document.dispatchEvent(createKeyboardEvent(windowObject, type, binding, repeat));
  }

  function createHelpOverlay(documentObject) {
    const overlay = documentObject.createElement('section');
    overlay.id = 'minidayz-pc-controls-help';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-label', 'Controles de MiniDayZ PC');
    Object.assign(overlay.style, {
      background: 'rgba(8, 12, 10, 0.94)',
      border: '1px solid #80906a',
      boxShadow: '0 8px 32px rgba(0, 0, 0, 0.65)',
      color: '#f1f1df',
      display: 'none',
      font: '14px/1.35 Arial, sans-serif',
      left: '50%',
      maxHeight: 'calc(100vh - 48px)',
      maxWidth: 'min(620px, calc(100vw - 48px))',
      overflow: 'auto',
      padding: '18px 22px',
      pointerEvents: 'none',
      position: 'fixed',
      top: '50%',
      transform: 'translate(-50%, -50%)',
      width: '520px',
      zIndex: '2147483647',
    });

    const title = documentObject.createElement('h2');
    title.textContent = `MiniDayZ PC ${VERSION} — Controles`;
    Object.assign(title.style, { fontSize: '18px', margin: '0 0 12px' });
    overlay.append(title);

    const table = documentObject.createElement('table');
    Object.assign(table.style, { borderCollapse: 'collapse', width: '100%' });
    for (const [key, action] of HELP_ROWS) {
      const row = documentObject.createElement('tr');
      const keyCell = documentObject.createElement('th');
      const actionCell = documentObject.createElement('td');
      keyCell.textContent = key;
      actionCell.textContent = action;
      Object.assign(keyCell.style, {
        color: '#d7dc8a',
        padding: '3px 14px 3px 0',
        textAlign: 'left',
        whiteSpace: 'nowrap',
      });
      Object.assign(actionCell.style, { padding: '3px 0' });
      row.append(keyCell, actionCell);
      table.append(row);
    }
    overlay.append(table);

    const footer = documentObject.createElement('p');
    footer.textContent = 'El clic izquierdo conserva la interacción táctil original para menús e inventario.';
    Object.assign(footer.style, { color: '#b9b9aa', margin: '12px 0 0' });
    overlay.append(footer);
    documentObject.body.append(overlay);
    return overlay;
  }

  function install(windowObject) {
    if (windowObject.__MINIDAYZ_PC_CONTROLS__?.installed) {
      return windowObject.__MINIDAYZ_PC_CONTROLS__;
    }

    const documentObject = windowObject.document;
    let overlay = null;
    let overlayVisible = false;
    const mouseButtonsDown = new Set();

    function setOverlayVisible(visible) {
      overlay ??= createHelpOverlay(documentObject);
      overlayVisible = visible;
      overlay.style.display = visible ? 'block' : 'none';
    }

    documentObject.addEventListener('keydown', (event) => {
      if (event.key === 'F1') {
        event.preventDefault();
        event.stopImmediatePropagation();
        setOverlayVisible(!overlayVisible);
        return;
      }

      if (event.key === 'Escape' && overlayVisible) {
        event.preventDefault();
        event.stopImmediatePropagation();
        setOverlayVisible(false);
        return;
      }

      if (isTypingTarget(event.target)) {
        return;
      }

      const alias = ARROW_ALIASES[event.key];
      if (alias) {
        event.preventDefault();
        dispatchKeyboard(windowObject, 'keydown', alias, event.repeat);
      } else if (PREVENTED_KEYS.has(event.key)) {
        event.preventDefault();
      }
    }, true);

    documentObject.addEventListener('keyup', (event) => {
      if (isTypingTarget(event.target)) {
        return;
      }
      const alias = ARROW_ALIASES[event.key];
      if (alias) {
        event.preventDefault();
        dispatchKeyboard(windowObject, 'keyup', alias);
      }
    }, true);

    documentObject.addEventListener('contextmenu', (event) => {
      if (event.target?.closest?.('#c2canvas, #c2canvasdiv')) {
        event.preventDefault();
      }
    }, true);

    documentObject.addEventListener('mousedown', (event) => {
      const binding = MOUSE_ALIASES[event.button];
      if (!binding || !event.target?.closest?.('#c2canvas, #c2canvasdiv')) {
        return;
      }
      event.preventDefault();
      mouseButtonsDown.add(event.button);
      dispatchKeyboard(windowObject, 'keydown', binding);
    }, true);

    documentObject.addEventListener('mouseup', (event) => {
      const binding = MOUSE_ALIASES[event.button];
      if (!binding || !mouseButtonsDown.delete(event.button)) {
        return;
      }
      event.preventDefault();
      dispatchKeyboard(windowObject, 'keyup', binding);
    }, true);

    const status = Object.freeze({
      bindings: PATCH_BINDING_COUNT,
      installed: true,
      version: VERSION,
    });
    Object.defineProperty(windowObject, '__MINIDAYZ_PC_CONTROLS__', {
      configurable: false,
      enumerable: false,
      value: status,
      writable: false,
    });
    return status;
  }

  return Object.freeze({
    ARROW_ALIASES,
    HELP_ROWS,
    MOUSE_ALIASES,
    PATCH_BINDING_COUNT,
    VERSION,
    createKeyboardEvent,
    install,
  });
}));
