# Perplexity Enter Key Control (by marusin)

Perplexity Enter Key Control is a Chrome extension that changes Enter key behavior in Perplexity so you can write multi-line prompts without accidentally sending them.

## Features

- Press Enter to insert a newline
- Send with the shortcut selected in the popup
- Enable or disable the extension from the popup
- Choose the popup display language
- Handles IME composition carefully for Japanese, Chinese, Korean, and other composition-based input methods

## Send Shortcuts

You can choose one send shortcut in the popup:

- Shift+Enter
- Ctrl+Enter
- Shift+Enter / Ctrl+Enter
- Shift+Ctrl+Enter
- Cmd+Enter on Mac
- Shift / Ctrl / Cmd + Enter on Mac
- Shift+Cmd+Enter on Mac

Perplexity uses a Lexical-based contenteditable input field. To preserve Perplexity's native line-break behavior, Shift+Enter remains available as a standard line break unless it is selected as the send shortcut.

## Scope

This initial release mainly targets Perplexity's main input box and the follow-up input box shown after an answer.

The extension may not work in every Perplexity UI. Spaces, Library, file attachment flows, voice input, special Pro screens, Computer, Comet, login modal inputs, and other special interfaces may be outside the supported scope.

## Privacy

- No data collection
- No external communication
- No remote code
- No user tracking
- Runs only on `https://www.perplexity.ai/*`

## Notice

This is an unofficial extension. It is not affiliated with, endorsed by, sponsored by, or otherwise connected to Perplexity AI.

## Installation for Local Testing

1. Open `chrome://extensions`
2. Enable Developer mode
3. Click "Load unpacked"
4. Select this extension directory
5. Open or reload `https://www.perplexity.ai/`

## Changelog

### 1.0.1

- Improved send shortcut compatibility for Perplexity in multilingual UI environments.
- Improved send button detection for localized Perplexity UI labels.
- Adjusted send button detection to avoid feedback, comment, and report buttons.

### 1.0.0

- Initial public release
- Enter inserts a newline in supported Perplexity input boxes
- Selected shortcut sends the prompt
- Added popup settings, localization, IME safeguards, and duplicate initialization guards
