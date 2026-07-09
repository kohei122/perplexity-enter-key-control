(() => {
const INIT_KEY = "__perplexityEnterKeyControlInitialized";
const INIT_MARKER_ATTRIBUTE = "data-perplexity-enter-key-control-initialized";
if (window[INIT_KEY] || document.documentElement?.hasAttribute(INIT_MARKER_ATTRIBUTE)) return;
window[INIT_KEY] = true;
document.documentElement?.setAttribute(INIT_MARKER_ATTRIBUTE, "true");

const DEFAULT_SETTINGS = {
  enabled: true,
  mode: "shift"
};
const DEV_FORCE_MAC_PLATFORM_KEY = "devForceMacPlatform";
const COMPOSITION_END_GRACE_MS = 80;
const INPUT_SELECTOR = '#ask-input[contenteditable="true"][role="textbox"][data-lexical-editor="true"], [contenteditable="true"][role="textbox"][data-lexical-editor="true"]';
const SEND_LABEL_PATTERNS = [
  "送信",
  "メッセージを送信",
  "Send",
  "Send message",
  "Submit",
  "Envoyer",
  "Envoyer un message",
  "Enviar",
  "Enviar mensaje",
  "Enviar mensagem",
  "Senden",
  "Nachricht senden",
  "Invia",
  "Invia messaggio",
  "Verzenden",
  "Wyślij",
  "Gönder",
  "Kirim",
  "Gửi",
  "Отправить",
  "Надіслати",
  "메시지 보내기",
  "보내기",
  "전송",
  "发送",
  "发送消息",
  "傳送",
  "傳送訊息",
  "送出"
];
const SEND_LABEL_LOWERCASE_PATTERNS = [
  "send",
  "submit",
  "envoyer",
  "enviar",
  "senden",
  "invia",
  "verzenden",
  "wyślij",
  "gönder",
  "kirim",
  "gửi",
  "отправить",
  "надіслати"
];
const EXCLUDED_BUTTON_LABEL_PATTERNS = [
  "feedback",
  "comment",
  "report",
  "menu",
  "options",
  "microphone",
  "attach",
  "settings",
  "history",
  "フィードバック",
  "コメント",
  "報告",
  "commentaire",
  "commentaires",
  "comentarios",
  "comentário",
  "comentários",
  "의견",
  "피드백",
  "댓글",
  "신고",
  "反馈",
  "评论",
  "举报",
  "意見回饋",
  "回饋",
  "評論",
  "檢舉"
];

let settings = { ...DEFAULT_SETTINGS };
let settingsLoaded = false;
let isMacPlatform = false;
let isComposingActive = false;
let lastCompositionEndAt = 0;
let isDispatchingSyntheticNewline = false;

function sanitizeMode(mode) {
  return mode === "ctrl" ||
    mode === "cmd" ||
    mode === "both" ||
    mode === "combo" ||
    mode === "shiftCmd"
    ? mode
    : "shift";
}

function sanitizeModeForPlatform(mode, isMac) {
  const sanitized = sanitizeMode(mode);
  if (!isMac && (sanitized === "cmd" || sanitized === "shiftCmd")) return "shift";
  return sanitized;
}

function sanitizeEnabled(enabled) {
  if (enabled === true || enabled === false) return enabled;
  if (enabled === "true") return true;
  if (enabled === "false") return false;
  return true;
}

function getIsMacPlatform() {
  return new Promise((resolve) => {
    if (typeof chrome === "undefined" || !chrome.runtime?.getPlatformInfo) {
      resolve(false);
      return;
    }

    chrome.runtime.getPlatformInfo((info) => {
      if (chrome.runtime.lastError) {
        resolve(false);
        return;
      }
      resolve(info?.os === "mac");
    });
  });
}

function getDevForceMacPlatform() {
  return new Promise((resolve) => {
    chrome.storage.local.get({ [DEV_FORCE_MAC_PLATFORM_KEY]: false }, (stored) => {
      resolve(stored[DEV_FORCE_MAC_PLATFORM_KEY] === true);
    });
  });
}

async function resolveIsMacPlatform() {
  const devForceMacPlatform = await getDevForceMacPlatform();
  if (devForceMacPlatform) return true;
  return getIsMacPlatform();
}

async function loadSettings() {
  isMacPlatform = await resolveIsMacPlatform();

  chrome.storage.local.get(DEFAULT_SETTINGS, (stored) => {
    const next = {
      enabled: sanitizeEnabled(stored.enabled),
      mode: sanitizeModeForPlatform(stored.mode, isMacPlatform)
    };

    settings = next;
    settingsLoaded = true;
    chrome.storage.local.set(next);
  });
}

loadSettings();

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") return;

  if (changes.enabled) {
    settings.enabled = sanitizeEnabled(changes.enabled.newValue);
  }

  if (changes.mode) {
    settings.mode = sanitizeModeForPlatform(changes.mode.newValue, isMacPlatform);
  }

  if (changes[DEV_FORCE_MAC_PLATFORM_KEY]) {
    resolveIsMacPlatform().then((nextIsMacPlatform) => {
      isMacPlatform = nextIsMacPlatform;
      settings.mode = sanitizeModeForPlatform(settings.mode, isMacPlatform);
    });
  }
});

function blockEnterEvent(event) {
  event.preventDefault();
  event.stopImmediatePropagation();
}

function normalizeLabel(value) {
  return String(value || "").trim().toLowerCase();
}

function isVisible(element) {
  return Boolean(element.offsetParent || element.getClientRects().length);
}

function isPerplexityInput(element) {
  if (!(element instanceof HTMLElement)) return false;
  if (!element.matches(INPUT_SELECTOR)) return false;
  if (element.closest('[data-testid="login-modal"]')) return false;
  return true;
}

function resolvePerplexityInputTarget(target) {
  if (!(target instanceof Element)) return null;
  const input = target.closest(INPUT_SELECTOR);
  return isPerplexityInput(input) ? input : null;
}

function isExcludedButtonLabel(label) {
  const normalizedLabel = normalizeLabel(label);
  return EXCLUDED_BUTTON_LABEL_PATTERNS.some((pattern) => label.includes(pattern)) ||
    EXCLUDED_BUTTON_LABEL_PATTERNS.some((pattern) => normalizedLabel.includes(pattern));
}

function isSendButtonLabel(label) {
  const normalizedLabel = normalizeLabel(label);
  return SEND_LABEL_PATTERNS.some((pattern) => label.includes(pattern)) ||
    SEND_LABEL_LOWERCASE_PATTERNS.some((pattern) => normalizedLabel.includes(pattern));
}

function collectSendButtons(scope) {
  if (!(scope instanceof Element)) return [];

  const buttons = [...scope.querySelectorAll("button")];
  const sendButtons = [];
  for (const button of buttons) {
    if (!(button instanceof HTMLButtonElement)) continue;
    if (button.disabled || button.getAttribute("aria-disabled") === "true" || !isVisible(button)) continue;

    const label = button.getAttribute("aria-label") || "";
    if (isExcludedButtonLabel(label)) continue;
    if (isSendButtonLabel(label)) {
      sendButtons.push(button);
    }
  }

  return sendButtons;
}

function findSendButton(scope) {
  const sendButtons = collectSendButtons(scope);
  return sendButtons.length === 1 ? sendButtons[0] : null;
}

function resolvePerplexitySendButton(inputTarget) {
  if (!(inputTarget instanceof HTMLElement)) return null;

  let node = inputTarget.parentElement;
  while (node instanceof HTMLElement && node !== document.body) {
    const button = findSendButton(node);
    if (button) return button;
    node = node.parentElement;
  }

  const fallback = findSendButton(document);
  return fallback instanceof HTMLButtonElement ? fallback : null;
}
function createSyntheticShiftEnterEvent(type) {
  const event = new KeyboardEvent(type, {
    key: "Enter",
    code: "Enter",
    bubbles: true,
    cancelable: true,
    composed: true,
    shiftKey: true
  });

  for (const property of ["keyCode", "which", "charCode"]) {
    try {
      Object.defineProperty(event, property, { get: () => property === "charCode" ? 0 : 13 });
    } catch {
      // Some browsers expose these legacy properties as non-configurable.
    }
  }

  return event;
}

function dispatchPerplexityStandardNewline(target) {
  if (!(target instanceof HTMLElement)) return;

  target.focus();
  isDispatchingSyntheticNewline = true;
  try {
    target.dispatchEvent(createSyntheticShiftEnterEvent("keydown"));
    target.dispatchEvent(createSyntheticShiftEnterEvent("keyup"));
  } finally {
    isDispatchingSyntheticNewline = false;
  }
}
function shouldSendByMode(mode, isShift, isCtrl, isAlt, isMeta, isMac) {
  if (isAlt) return false;

  if (mode === "shift") {
    return isShift && !isCtrl && !isMeta;
  }
  if (mode === "ctrl") {
    return isCtrl && !isShift && !isMeta;
  }
  if (mode === "cmd") {
    return isMac && isMeta && !isShift && !isCtrl;
  }
  if (mode === "both") {
    if (isMac) {
      return [isShift, isCtrl, isMeta].filter(Boolean).length === 1;
    }
    return (isShift && !isCtrl && !isMeta) || (isCtrl && !isShift && !isMeta);
  }
  if (mode === "combo") {
    return isShift && isCtrl && !isMeta;
  }
  if (mode === "shiftCmd") {
    return isMac && isShift && isMeta && !isCtrl;
  }
  return false;
}

function handleKey(event) {
  const isEnter = event.code === "Enter" || event.code === "NumpadEnter" || event.key === "Enter";
  const inputTarget = resolvePerplexityInputTarget(event.target);
  const inCompositionGraceWindow =
    lastCompositionEndAt > 0 &&
    performance.now() - lastCompositionEndAt < COMPOSITION_END_GRACE_MS;

  if (isDispatchingSyntheticNewline) return;
  if (!event.isTrusted) return;
  if (isComposingActive || event.isComposing || event.keyCode === 229 || inCompositionGraceWindow) return;
  if (!settingsLoaded) return;
  if (!settings.enabled) return;
  if (!inputTarget || !isEnter) return;

  const mode = sanitizeModeForPlatform(settings.mode, isMacPlatform);
  const isOnlyEnter = !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey;
  const isSend = shouldSendByMode(
    mode,
    event.shiftKey,
    event.ctrlKey,
    event.altKey,
    event.metaKey,
    isMacPlatform
  );

  if (isOnlyEnter) {
    blockEnterEvent(event);
    dispatchPerplexityStandardNewline(inputTarget);
    return;
  }

  if (isSend) {
    blockEnterEvent(event);
    const sendButton = resolvePerplexitySendButton(inputTarget);
    if (sendButton && !sendButton.disabled) {
      sendButton.click();
    }
    return;
  }

  if (event.ctrlKey || event.metaKey || event.altKey) {
    blockEnterEvent(event);
  }
}

document.addEventListener("keydown", handleKey, { capture: true });

document.addEventListener("compositionstart", (event) => {
  const inputTarget = resolvePerplexityInputTarget(event.target);
  if (!inputTarget) return;
  isComposingActive = true;
}, { capture: true });

document.addEventListener("compositionend", (event) => {
  const inputTarget = resolvePerplexityInputTarget(event.target);
  if (!inputTarget) return;
  isComposingActive = false;
  lastCompositionEndAt = performance.now();
}, { capture: true });
})();
