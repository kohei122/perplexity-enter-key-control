// Minimal host-editor behavior, not extension send logic. All button clicks are observed.
window.fixture = { clicks: [], submitCount: 0, newlineEvents: [] };
document.addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button) return;
  event.preventDefault();
  window.fixture.clicks.push(button.id);
  window.fixture.submitCount++;
});
document.addEventListener('submit', event => event.preventDefault());
document.addEventListener('keydown', event => {
  if (event.key !== 'Enter' || !event.shiftKey || event.ctrlKey || event.metaKey ||
      event.altKey || event.isComposing || event.defaultPrevented) return;
  const editor = event.target.closest('[contenteditable="true"], textarea');
  if (!editor) return;
  event.preventDefault();
  window.fixture.newlineEvents.push({ trusted: event.isTrusted, code: event.code });
  if (editor instanceof HTMLTextAreaElement) {
    editor.setRangeText('\n', editor.selectionStart, editor.selectionEnd, 'end');
    editor.dispatchEvent(new Event('input', { bubbles: true }));
  } else {
    document.execCommand('insertLineBreak');
  }
});
document.documentElement.setAttribute('data-fixture-ready', 'true');
