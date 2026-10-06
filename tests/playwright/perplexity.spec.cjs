const { test, expect } = require('./helpers/extension.cjs');

async function typeAndSend(page, selector, shortcut = 'Shift+Enter') {
  const input = page.locator(selector);
  await input.fill('alpha');
  await input.press(shortcut);
}
async function expectNoSend(page) {
  expect(await page.evaluate(() => ({
    clicks: window.fixture.clicks, submitCount: window.fixture.submitCount,
  }))).toEqual({ clicks: [], submitCount: 0 });
}

for (const [mode, shortcut] of [
  ['shift', 'Shift+Enter'], ['ctrl', 'Control+Enter'],
  ['both', 'Shift+Enter'], ['both', 'Control+Enter'], ['combo', 'Control+Shift+Enter'],
]) {
  test('current: Enter newline then one send: ' + mode + ' / ' + shortcut, async ({ harness }) => {
    const { page, open } = harness;
    await open('current', { mode });
    const input = page.locator('#ask-input');
    await input.fill('alpha');
    await input.press('End');
    await input.press('Enter');
    await page.keyboard.insertText('beta');
    await expect.poll(() => input.innerText()).toBe('alpha\nbeta');
    await expectNoSend(page);
    expect(await page.evaluate(() => window.fixture.newlineEvents)).toEqual([{ trusted: false, code: 'Enter' }]);
    await input.press(shortcut);
    expect(await page.evaluate(() => window.fixture.clicks)).toEqual(['send']);
    expect(await page.evaluate(() => window.fixture.submitCount)).toBe(1);
  });
}
for (const name of ['fallback-textarea', 'fallback-contenteditable', 'stale-valid']) {
  test(name + ': Enter newline and one send', async ({ harness }) => {
    const { page, open } = harness;
    await open(name);
    const input = page.locator(name === 'stale-valid' ? '#ask-input' : '#editor');
    await input.fill('alpha');
    await input.press('End');
    await input.press('Enter');
    await page.keyboard.insertText('beta');
    if (name === 'fallback-textarea') await expect(input).toHaveValue('alpha\nbeta');
    else await expect.poll(() => input.innerText()).toBe('alpha\nbeta');
    await expectNoSend(page);
    await input.press('Shift+Enter');
    expect(await page.evaluate(() => window.fixture.clicks)).toEqual(['send']);
  });
}
test('independent composers: only the focused composer sends', async ({ harness }) => {
  const { page, open } = harness;
  await open('multiple-composers');
  await typeAndSend(page, '#second-input');
  expect(await page.evaluate(() => window.fixture.clicks)).toEqual(['second']);
  await typeAndSend(page, '#first-input');
  expect(await page.evaluate(() => window.fixture.clicks)).toEqual(['second', 'first']);
});

for (const [name, selector] of [
  ['no-send', '#ask-input'], ['multiple-send', '#ask-input'],
  ['shared-inputs', '#first-input'], ['unknown-root', '#ask-input'],
  ['unknown-input', '#editor'], ['disabled-send', '#ask-input'],
  ['aria-disabled-send', '#ask-input'], ['hidden-send', '#ask-input'],
  ['unknown-button', '#ask-input'], ['excluded-button', '#ask-input'],
  ['send-feedback', '#ask-input'], ['login-modal', '#ask-input'],
]) {
  test('fail closed: ' + name, async ({ harness }) => {
    const { page, open } = harness;
    await open(name);
    await typeAndSend(page, selector);
    await expectNoSend(page);
  });
}
for (const name of ['no-input', 'hidden-only']) {
  test('fail closed: ' + name, async ({ harness }) => {
    const { page, open } = harness;
    await open(name);
    expect(await page.locator('[contenteditable]:visible, textarea:visible').count()).toBe(0);
    await page.locator('body').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('Shift+Enter');
    await expectNoSend(page);
  });
}
test('unselected Shift+Enter remains host newline in ctrl mode', async ({ harness }) => {
  const { page, open } = harness;
  await open('current', { mode: 'ctrl' });
  await typeAndSend(page, '#ask-input', 'Shift+Enter');
  await expectNoSend(page);
  expect(await page.evaluate(() => window.fixture.newlineEvents)).toEqual([{ trusted: true, code: 'Enter' }]);
});
test('disabled extension: selected shortcut does not click', async ({ harness }) => {
  const { page, open } = harness;
  await open('current', { enabled: false });
  await typeAndSend(page, '#ask-input');
  await expectNoSend(page);
});
test('untrusted synthetic shortcut cannot send', async ({ harness }) => {
  const { page, open } = harness;
  await open('current');
  await page.locator('#ask-input').evaluate(input => {
    input.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Enter', code: 'Enter', shiftKey: true, bubbles: true, cancelable: true,
    }));
  });
  await expectNoSend(page);
});
test('compositionstart suppresses trusted shortcut until composition ends', async ({ harness }) => {
  const { page, open } = harness;
  await open('current');
  const input = page.locator('#ask-input');
  await input.fill('composition');
  await input.dispatchEvent('compositionstart');
  await input.press('Shift+Enter');
  await expectNoSend(page);
});

test('nested independent composers resolve the focused local context', async ({ harness }) => {
  const { page, open } = harness;
  await open('multiple-composers');
  await page.locator('main').evaluate(main => {
    const outer = document.createElement('div');
    outer.setAttribute('data-ask-input-container', 'true');
    while (main.firstChild) outer.append(main.firstChild);
    main.append(outer);
  });
  await typeAndSend(page, '#second-input');
  expect(await page.evaluate(() => window.fixture.clicks)).toEqual(['second']);
});
for (const state of ['hidden', 'visibility', 'disabled', 'readOnly']) {
  test('same context ignores non-usable stale input: ' + state, async ({ harness }) => {
    const { page, open } = harness;
    await open('current');
    await page.locator('section').evaluate((root, state) => {
      const stale = document.createElement('textarea');
      if (state === 'visibility') stale.className = 'invisible';
      else stale[state] = true;
      root.prepend(stale);
    }, state);
    await typeAndSend(page, '#ask-input');
    expect(await page.evaluate(() => window.fixture.clicks)).toEqual(['send']);
  });
}
for (const [name, attrs] of [
  ['localized label', { 'aria-label': '送信' }],
  ['submit type', { type: 'submit' }],
  ['data attribute', { 'data-testid': 'send-action' }],
  ['visual combination', { class: 'bg-button-bg text-inverse aspect-square rounded-full visual-candidate' }],
]) {
  test('existing known send signal: ' + name, async ({ harness }) => {
    const { page, open } = harness;
    await open('current');
    await page.locator('#send').evaluate((button, attrs) => {
      for (const attr of [...button.attributes]) button.removeAttribute(attr.name);
      button.id = 'action';
      button.type = 'button';
      button.textContent = '';
      for (const [name, value] of Object.entries(attrs)) button.setAttribute(name, value);
    }, attrs);
    await typeAndSend(page, '#ask-input');
    expect(await page.evaluate(() => window.fixture.clicks)).toEqual(['action']);
  });
}
for (const [name, attrs] of [
  ['localized feedback', { 'aria-label': 'フィードバックを送信' }],
  ['feedback context attribute', { 'data-testid': 'feedback', 'aria-label': 'Send' }],
  ['menu context', { 'aria-haspopup': 'menu', 'aria-label': 'Send' }],
]) {
  test('exclusion wins over known send signal: ' + name, async ({ harness }) => {
    const { page, open } = harness;
    await open('current');
    await page.locator('#send').evaluate((button, attrs) => {
      for (const [name, value] of Object.entries(attrs)) button.setAttribute(name, value);
    }, attrs);
    await typeAndSend(page, '#ask-input');
    await expectNoSend(page);
  });
}
test('semantic and visual candidates together abstain', async ({ harness }) => {
  const { page, open } = harness;
  await open('current');
  await page.locator('section').evaluate(root => {
    const button = document.createElement('button');
    button.type = 'button';
    button.id = 'visual';
    button.className = 'bg-button-bg text-inverse aspect-square rounded-full visual-candidate';
    root.append(button);
  });
  await typeAndSend(page, '#ask-input');
  await expectNoSend(page);
});
test('non-send inner toolbar preserves unique outer send context', async ({ harness }) => {
  const { page, open } = harness;
  await open('current');
  await page.locator('#ask-input').evaluate(input => {
    const wrapper = document.createElement('div');
    input.before(wrapper);
    wrapper.append(input);
    const toolbar = document.createElement('button');
    toolbar.id = 'toolbar';
    toolbar.type = 'button';
    toolbar.setAttribute('aria-label', 'Attach file');
    wrapper.append(toolbar);
  });
  await typeAndSend(page, '#ask-input');
  expect(await page.evaluate(() => window.fixture.clicks)).toEqual(['send']);
});
