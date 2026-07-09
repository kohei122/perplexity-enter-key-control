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
const MAX_COMPOSER_ROOT_DEPTH = 10;
const INPUT_SELECTOR = [
  "#ask-input",
  '[id="ask-input"][role="textbox"]',
  "textarea",
  '#ask-input[contenteditable="true"][role="textbox"][data-lexical-editor="true"]',
  '[data-lexical-editor="true"][role="textbox"]',
  '[contenteditable="true"][role="textbox"][data-lexical-editor="true"]',
  '[contenteditable="true"][role="textbox"]',
  'div[contenteditable="true"]'
].join(", ");
const BROAD_COMPOSER_ROOT_TAGS = new Set(["HTML", "BODY", "MAIN"]);
const SEND_LABEL_PATTERNS = [
  "送信",
  "メッセージを送信",
  "Send",
  "Send message",
  "Submit",
  "Submit message",
  "Envoyer",
  "envoyer",
  "Envoyer le message",
  "Envoyer un message",
  "Enviar",
  "Enviar mensaje",
  "Enviar mensagem",
  "Senden",
  "Nachricht senden",
  "Invia",
  "Invia messaggio",
  "Verzenden",
  "Sturen",
  "Bericht sturen",
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
  "提交",
  "傳送",
  "發送",
  "傳送訊息",
  "發送訊息",
  "提交",
  "送出",
  "भेजें",
  "सबमिट करें",
  "संदेश भेजें"
];
const SEND_LABEL_LOWERCASE_PATTERNS = [
  "send",
  "send message",
  "submit",
  "submit message",
  "envoyer",
  "envoyer le message",
  "envoyer un message",
  "enviar",
  "enviar mensaje",
  "enviar mensagem",
  "senden",
  "nachricht senden",
  "invia",
  "invia messaggio",
  "sturen",
  "bericht sturen",
  "verzenden",
  "wyślij",
  "gönder",
  "kirim",
  "gửi",
  "отправить",
  "надіслати"
];
const EXCLUDED_BUTTON_LABEL_PATTERNS = [
  "add file",
  "add files",
  "adjuntar",
  "ajouter",
  "Ajouter des fichiers ou des outils",
  "anexar",
  "archivo",
  "arquivo",
  "attach",
  "attachment",
  "audio",
  "bug",
  "feedback",
  "file",
  "files",
  "focus",
  "help",
  "comment",
  "computer",
  "Computer",
  "dictée",
  "Dictée",
  "dictee",
  "fichiers",
  "mic",
  "microphone",
  "mode",
  "model",
  "modèle",
  "Modèle",
  "modele",
  "more",
  "options",
  "outils",
  "record",
  "recording",
  "report",
  "recherche",
  "Recherche",
  "search",
  "settings",
  "sources",
  "upload",
  "voice",
  "web",
  "menu",
  "history",
  "アップロード",
  "ファイル",
  "フィードバック",
  "コメント",
  "マイク",
  "メニュー",
  "モデル",
  "モード",
  "設定",
  "検索",
  "音声",
  "録音",
  "添付",
  "報告",
  "commentaire",
  "commentaires",
  "comentarios",
  "comentário",
  "comentários",
  "configuración",
  "configurações",
  "denunciar",
  "fontes",
  "grabar",
  "gravação",
  "micrófono",
  "microfone",
  "menú",
  "녹음",
  "마이크",
  "검색",
  "설정",
  "음성",
  "의견",
  "피드백",
  "댓글",
  "추가",
  "출처",
  "파일",
  "신고",
  "上传",
  "上傳",
  "设置",
  "评论",
  "语音",
  "麦克风",
  "反馈",
  "举报",
  "錄音",
  "語音",
  "設定",
  "麥克風",
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

function labelIncludesAnyPattern(label, patterns) {
  const normalizedLabel = normalizeLabel(label);
  return patterns.some((pattern) => label.includes(pattern)) ||
    patterns.some((pattern) => normalizedLabel.includes(normalizeLabel(pattern)));
}

function getPerplexityButtonLabel(button) {
  return [
    button.getAttribute("aria-label"),
    button.getAttribute("title"),
    button.getAttribute("data-testid"),
    button.getAttribute("data-test-id"),
    button.getAttribute("name"),
    button.getAttribute("value"),
    button.textContent
  ].filter(Boolean).join(" ");
}

function hasKnownPerplexitySendLabel(button) {
  return labelIncludesAnyPattern(getPerplexityButtonLabel(button), SEND_LABEL_PATTERNS) ||
    labelIncludesAnyPattern(getPerplexityButtonLabel(button), SEND_LABEL_LOWERCASE_PATTERNS);
}

function isExcludedPerplexityButton(button) {
  const label = getPerplexityButtonLabel(button);
  const hasMenuPopup = normalizeLabel(button.getAttribute("aria-haspopup")) === "menu";
  if (hasMenuPopup && !hasKnownPerplexitySendLabel(button)) return true;
  return labelIncludesAnyPattern(label, EXCLUDED_BUTTON_LABEL_PATTERNS);
}

function hasStrongPerplexitySendSignal(button) {
  if (hasKnownPerplexitySendLabel(button)) return true;
  if (normalizeLabel(button.getAttribute("type")) === "submit") return true;

  const structuralSignal = [
    button.id,
    button.className,
    button.getAttribute("data-testid"),
    button.getAttribute("data-test-id")
  ].filter(Boolean).join(" ");

  return /\b(send|submit)\b/i.test(structuralSignal);
}

function hasPerplexitySendButtonVisualSignal(button, root) {
  const className = String(button.className || "");
  const classSignals = [
    "bg-button-bg",
    "text-inverse",
    "aspect-square",
    "rounded-full"
  ].filter((classSignal) => className.includes(classSignal)).length;

  if (classSignals < 2) return false;
  if (typeof button.getBoundingClientRect !== "function") return classSignals >= 3;

  const buttonRect = button.getBoundingClientRect();
  const isSmallSquareButton =
    buttonRect.width >= 24 &&
    buttonRect.width <= 44 &&
    buttonRect.height >= 24 &&
    buttonRect.height <= 44 &&
    Math.abs(buttonRect.width - buttonRect.height) <= 6;

  if (!isSmallSquareButton) return false;
  if (!(root instanceof HTMLElement) || typeof root.getBoundingClientRect !== "function") return true;

  const rootRect = root.getBoundingClientRect();
  return rootRect.width <= 0 || buttonRect.right >= rootRect.right - Math.max(72, rootRect.width * 0.2);
}

function isSelectablePerplexityButton(button) {
  return button instanceof HTMLButtonElement &&
    !button.disabled &&
    button.getAttribute("aria-disabled") !== "true" &&
    isVisible(button);
}

function scorePerplexitySendButton(button, root) {
  if (!isSelectablePerplexityButton(button)) return -1;
  if (isExcludedPerplexityButton(button) && !hasKnownPerplexitySendLabel(button)) return -1;
  if (hasStrongPerplexitySendSignal(button)) return 10;
  if (hasPerplexitySendButtonVisualSignal(button, root)) return 2;
  return 1;
}

function collectPerplexitySendButtonCandidates(root) {
  if (!(root instanceof Element)) return [];

  return [...root.querySelectorAll("button")]
    .filter((button) => button instanceof HTMLButtonElement)
    .map((button) => ({ button, score: scorePerplexitySendButton(button, root) }))
    .filter((candidate) => candidate.score > 0);
}

function findSendButtonBySingleRemainingPerplexityCandidate(candidates) {
  const selectableCandidates = candidates.filter((candidate) => candidate.score > 0);
  const strongCandidates = selectableCandidates.filter((candidate) => candidate.score >= 10);
  if (strongCandidates.length === 1) return strongCandidates[0].button;
  if (strongCandidates.length > 1) return null;
  return selectableCandidates.length === 1 ? selectableCandidates[0].button : null;
}

function isBroadPerplexityComposerRoot(element) {
  return BROAD_COMPOSER_ROOT_TAGS.has(element.tagName);
}

function isPreferredPerplexityComposerRoot(element) {
  return element.getAttribute("data-ask-input-container") === "true";
}

function getPerplexityComposerRootCandidates(inputTarget) {
  const preferredRoots = [];
  const roots = [];
  let node = inputTarget.parentElement;
  let depth = 0;

  while (node instanceof HTMLElement && depth < MAX_COMPOSER_ROOT_DEPTH) {
    if (isBroadPerplexityComposerRoot(node)) break;
    if (node.contains(inputTarget) && node.querySelector("button")) {
      if (isPreferredPerplexityComposerRoot(node)) {
        preferredRoots.push(node);
      } else {
        roots.push(node);
      }
    }
    node = node.parentElement;
    depth += 1;
  }

  return [...preferredRoots, ...roots];
}

function findPerplexityComposerRoot(inputTarget) {
  return getPerplexityComposerRootCandidates(inputTarget)[0] || null;
}

function resolvePerplexitySendButton(inputTarget) {
  if (!(inputTarget instanceof HTMLElement)) return null;

  const roots = getPerplexityComposerRootCandidates(inputTarget);
  for (const root of roots) {
    const button = findSendButtonBySingleRemainingPerplexityCandidate(
      collectPerplexitySendButtonCandidates(root)
    );
    if (button) return button;
  }

  return null;
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
