const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Expose actual closure functions only in an in-memory copy; shipping source is unchanged.
function load() {
  const listeners = {};
  const events = [];
  // Minimal tree/attribute adapter; all selection/scoring decisions remain in content.js.
  class Element {
    constructor({ tag = 'DIV', input = true, attrs = {}, children = [], visible = true,
      visibility = 'visible', rect = { width: 32, height: 32, right: 480 } } = {}) {
      Object.assign(this, { tagName: tag, input, attrs, children, visible, visibility, rect });
      this.id = attrs.id || '';
      this.className = attrs.class || '';
      this.textContent = attrs.text || '';
      this.disabled = false;
      this.readOnly = false;
      this.clicks = 0;
      for (const child of children) child.parentElement = this;
    }
    matches(selector) { return selector === 'button' ? this.tagName === 'BUTTON' : this.input; }
    closest(selector) {
      for (let node = this; node; node = node.parentElement) {
        if (selector.includes('login-modal')) {
          if (node.attrs['data-testid'] === 'login-modal') return node;
        } else if (selector.includes('[hidden]')) {
          if ('hidden' in node.attrs || 'inert' in node.attrs || node.attrs['aria-hidden'] === 'true') return node;
        } else if (node.matches(selector)) return node;
      }
      return null;
    }
    getAttribute(name) { return this.attrs[name] ?? null; }
    getClientRects() { return this.visible ? [this.rect] : []; }
    getBoundingClientRect() { return this.rect; }
    contains(other) { return this === other || this.children.some(child => child.contains(other)); }
    querySelectorAll(selector) {
      return this.children.flatMap(child => [
        ...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector),
      ]);
    }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    focus() {}
    click() { this.clicks++; }
    dispatchEvent(event) { events.push(event); }
  }
  class Button extends Element {
    constructor(options = {}) { super({ ...options, tag: 'BUTTON', input: false }); }
  }
  class KeyboardEvent {
    constructor(type, options) { this.type = type; Object.assign(this, options); }
  }
  const context = vm.createContext({
    window: {}, Element, HTMLElement: Element, HTMLButtonElement: Button,
    getComputedStyle: element => ({ visibility: element.visibility }),
    KeyboardEvent, performance: { now: () => context.now }, now: 1000,
    document: {
      documentElement: { hasAttribute: () => false, setAttribute() {} },
      addEventListener: (type, callback) => { listeners[type] = callback; },
    },
    // Keep async startup pending. Tests explicitly control real closure state.
    chrome: { storage: { local: { get() {}, set() {} }, onChanged: { addListener() {} } } },
  });
  const source = fs.readFileSync(path.join(__dirname, '../../content.js'), 'utf8');
  assert.match(source, /\}\)\(\);\s*$/);
  vm.runInContext(source.replace(/\}\)\(\);\s*$/, `
    globalThis.api = {
      sanitizeEnabled, sanitizeModeForPlatform, shouldSendByMode,
      findSendButtonBySingleRemainingPerplexityCandidate, resolvePerplexitySendButton, handleKey,
      setState(values) {
        settings = { enabled: true, mode: 'shift', ...values.settings };
        settingsLoaded = values.loaded ?? true;
        isMacPlatform = values.mac ?? false;
        isComposingActive = values.composing ?? false;
        lastCompositionEndAt = values.endedAt ?? 0;
      }
    };
  })();`), context);
  const input = new Element();
  context.api.setState({});
  const key = (overrides = {}) => ({
    target: input, key: 'Enter', code: 'Enter', keyCode: 13, isTrusted: true,
    isComposing: false, shiftKey: false, ctrlKey: false, altKey: false, metaKey: false,
    prevented: false, stopped: false,
    preventDefault() { this.prevented = true; },
    stopImmediatePropagation() { this.stopped = true; },
    ...overrides,
  });
  return { api: context.api, context, input, events, listeners, key, Element, Button };
}
for (const mac of [false, true]) {
  for (const [mode, accepted] of Object.entries({
    shift: [1], ctrl: [2], cmd: mac ? [8] : [],
    both: mac ? [1, 2, 8] : [1, 2], combo: [3], shiftCmd: mac ? [9] : [],
  })) {
    test('shortcut truth table: ' + (mac ? 'Mac ' : 'Windows ') + mode, () => {
      const { api } = load();
      for (let mask = 0; mask < 16; mask++) {
        assert.equal(api.shouldSendByMode(mode, !!(mask & 1), !!(mask & 2),
          !!(mask & 4), !!(mask & 8), mac), accepted.includes(mask), 'modifier mask ' + mask);
      }
    });
  }
}
test('enabled setting sanitization', () => {
  const { api } = load();
  for (const [input, output] of [[true, true], [false, false], ['true', true], ['false', false], [null, true]]) {
    assert.equal(api.sanitizeEnabled(input), output);
  }
});
test('platform mode sanitization', () => {
  const { api } = load();
  for (const mode of ['cmd', 'shiftCmd']) {
    assert.equal(api.sanitizeModeForPlatform(mode, false), 'shift');
    assert.equal(api.sanitizeModeForPlatform(mode, true), mode);
  }
  assert.equal(api.sanitizeModeForPlatform('unknown', true), 'shift');
});
for (const [name, state, overrides] of [
  ['isComposing', {}, { isComposing: true }],
  ['keyCode 229', {}, { keyCode: 229 }],
  ['composition active', { composing: true }, {}],
  ['IME grace at 79ms', { endedAt: 921 }, {}],
  ['settings not loaded', { loaded: false }, {}],
  ['disabled', { settings: { enabled: false } }, {}],
  ['untrusted', {}, { isTrusted: false }],
]) {
  test('no intervention: ' + name, () => {
    const { api, events, key } = load();
    api.setState(state);
    const event = key(overrides);
    api.handleKey(event);
    assert.equal(event.prevented, false);
    assert.equal(events.length, 0);
  });
}
test('composition events and exact 80ms grace boundary', () => {
  const { api, listeners, context, input, events, key } = load();
  listeners.compositionstart({ target: input });
  api.handleKey(key());
  assert.equal(events.length, 0);
  listeners.compositionend({ target: input });
  context.now = 1079;
  api.handleKey(key());
  assert.equal(events.length, 0);
  context.now = 1080;
  api.handleKey(key());
  assert.equal(events.length, 2);
});
test('Enter dispatches one synthetic Shift+Enter keydown/keyup pair', () => {
  const { api, events, key } = load();
  const event = key();
  api.handleKey(event);
  assert.equal(event.prevented, true);
  assert.equal(event.stopped, true);
  assert.deepEqual(events.map(e => [e.type, e.key, e.shiftKey, e.keyCode, e.which, e.charCode]),
    [['keydown', 'Enter', true, 13, 13, 0], ['keyup', 'Enter', true, 13, 13, 0]]);
});
test('candidate resolution: no candidates or multiple strong candidates abstain', () => {
  const { api } = load();
  assert.equal(api.findSendButtonBySingleRemainingPerplexityCandidate([]), null);
  assert.equal(api.findSendButtonBySingleRemainingPerplexityCandidate([
    { button: 'first', score: 10 }, { button: 'second', score: 10 },
  ]), null);
  assert.equal(api.findSendButtonBySingleRemainingPerplexityCandidate([
    { button: 'known', score: 10 }, { button: 'unknown', score: 1 },
  ]), 'known');
});

function composer(h, inputs, buttons, attrs = {}) {
  return new h.Element({ input: false, tag: 'SECTION', attrs, children: [...inputs, ...buttons] });
}
function send(h, input) {
  h.context.document.activeElement = input;
  h.api.handleKey(h.key({ target: input, shiftKey: true }));
}
test('safety: two usable inputs sharing a button abstain despite focus', () => {
  const h = load();
  const second = new h.Element();
  const button = new h.Button({ attrs: { 'aria-label': 'Send' } });
  composer(h, [h.input, second], [button]);
  send(h, h.input);
  assert.equal(button.clicks, 0);
});
test('safety: an unknown single button never qualifies', () => {
  const h = load();
  const button = new h.Button({ attrs: { 'aria-label': '?' } });
  composer(h, [h.input], [button]);
  send(h, h.input);
  assert.equal(button.clicks, 0);
  assert.equal(h.api.findSendButtonBySingleRemainingPerplexityCandidate([{ button, score: 1 }]), null);
});
for (const [name, attrs] of [
  ['English feedback', { 'aria-label': 'Send feedback' }],
  ['Japanese feedback', { 'aria-label': 'フィードバックを送信' }],
  ['feedback data attribute', { 'aria-label': 'Send', 'data-testid': 'feedback' }],
  ['menu role signal', { 'aria-label': 'Send', 'aria-haspopup': 'menu' }],
]) {
  test('safety: exclusion overrides send signal: ' + name, () => {
    const h = load();
    const button = new h.Button({ attrs });
    composer(h, [h.input], [button]);
    send(h, h.input);
    assert.equal(button.clicks, 0);
  });
}
for (const [name, attrs] of [
  ['known English label', { 'aria-label': 'Send' }],
  ['known localized label', { 'aria-label': 'Envoyer' }],
  ['submit type', { type: 'submit' }],
  ['send data attribute', { 'data-testid': 'send-action' }],
  ['existing visual combination', { class: 'bg-button-bg text-inverse aspect-square rounded-full' }],
]) {
  test('safety: unique active input and ' + name + ' send once', () => {
    const h = load();
    const button = new h.Button({ attrs });
    composer(h, [h.input], [button]);
    send(h, h.input);
    assert.equal(button.clicks, 1);
  });
}
test('safety: focused independent inner composer is not rejected by shared outer root', () => {
  const h = load();
  const second = new h.Element();
  const firstButton = new h.Button({ attrs: { 'aria-label': 'Send' } });
  const secondButton = new h.Button({ attrs: { 'aria-label': 'Send' } });
  new h.Element({ input: false, children: [
    composer(h, [h.input], [firstButton]), composer(h, [second], [secondButton]),
  ], attrs: { 'data-ask-input-container': 'true' } });
  send(h, second);
  assert.equal(firstButton.clicks, 0);
  assert.equal(secondButton.clicks, 1);
});
test('safety: target outside the focused input cannot send', () => {
  const h = load();
  const button = new h.Button({ attrs: { 'aria-label': 'Send' } });
  composer(h, [h.input], [button]);
  h.context.document.activeElement = new h.Element();
  h.api.handleKey(h.key({ target: h.input, shiftKey: true }));
  assert.equal(button.clicks, 0);
});
for (const state of ['hidden', 'visibility', 'disabled', 'readOnly']) {
  test('safety: non-usable stale input does not make active input ambiguous: ' + state, () => {
    const h = load();
    const stale = new h.Element();
    if (state === 'hidden') stale.attrs.hidden = '';
    else if (state === 'visibility') stale.visibility = 'hidden';
    else stale[state] = true;
    const button = new h.Button({ attrs: { 'aria-label': 'Send' } });
    composer(h, [stale, h.input], [button]);
    send(h, h.input);
    assert.equal(button.clicks, 1);
  });
}
test('safety: semantic and visual send candidates together are ambiguous', () => {
  const h = load();
  const known = new h.Button({ attrs: { 'aria-label': 'Send' } });
  const visual = new h.Button({ attrs: { class: 'bg-button-bg text-inverse aspect-square rounded-full' } });
  composer(h, [h.input], [known, visual]);
  send(h, h.input);
  assert.equal(known.clicks + visual.clicks, 0);
});
test('safety: ambiguity in local context cannot be bypassed by an outer root', () => {
  const h = load();
  const first = new h.Button({ attrs: { 'aria-label': 'Send' } });
  const second = new h.Button({ attrs: { 'aria-label': 'Submit' } });
  const outer = new h.Button({ attrs: { 'aria-label': 'Send' } });
  new h.Element({ input: false, children: [composer(h, [h.input], [first, second]), outer],
    attrs: { 'data-ask-input-container': 'true' } });
  send(h, h.input);
  assert.equal(first.clicks + second.clicks + outer.clicks, 0);
});
test('safety: non-send toolbar wrapper allows a unique outer send context', () => {
  const h = load();
  const toolbar = new h.Button({ attrs: { 'aria-label': 'Attach file' } });
  const known = new h.Button({ attrs: { 'aria-label': 'Send' } });
  new h.Element({ input: false, children: [composer(h, [h.input], [toolbar]), known] });
  send(h, h.input);
  assert.equal(toolbar.clicks, 0);
  assert.equal(known.clicks, 1);
});
