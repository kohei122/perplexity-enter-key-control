# Perplexity Mock DOM regression tests

## 安全契約

本番content.jsを対象に、曖昧な入力・送信候補ではshortcut送信しない。
通常Enter、shortcut設定、storage、IME処理は変更しない。
manifest/versionは1.1.0のまま。基点commitは `68715cdf3fbd68bcf87480388608896fe1eded91`。
本番修正はcontent.jsだけ。テスト基盤と安全判定を同じ論理変更として管理する。

### 入力と送信context

- 入力selectorは既存の #ask-input、textarea、Lexical属性、role=textbox、div[contenteditable=true]等を維持。
  login-modal配下は対象外。ProseMirror固有selectorの追加なし。
- shortcut送信時だけ、event targetから解決した入力とdocument.activeElementから解決した入力の一致を要求。
- 有効入力は、既存selectorに一致し、表示され、disabled/readOnly/aria-disabledでないもの。
  hidden / inert / aria-hidden祖先、visibility:hidden/collapse、レイアウト矩形のない要素を除外する。
- 入力の近い祖先から、inputとbuttonを含むcontextを調べる。最大10段、HTML/BODY/MAINで停止。
  外側のdata-ask-input-container属性を理由に内側の独立composerを飛び越えない。
- context内の有効入力は対象の1個だけであること。共有ボタンに入力2個の場合、
  focusだけではボタンとの対応が証明できないため送信0。
- 独立composerが同じ外側containerに複数あっても、内側の入力と送信ボタンが一意なら
  フォーカス中のcomposerだけ送信可能。hidden/disabled/readOnlyのstale inputも一意性を妨げない。
- 内側に非送信toolbarしかない場合は、入力が一意のまま外側の既知sendを検査できる。
  入力またはsendが曖昧になった段階で停止し、外側探索で曖昧さを回避しない。

### 送信ボタン

- 既存の複数の識別手段を維持: 多言語sendラベル、type=submit、
  id/class/data-testid/data-test-idのsend/submitシグナル。
- 既存の外観組合せも維持: bg-button-bg / text-inverse / aspect-square / rounded-fullのうち2個以上、
  小さい正方形（24〜44px、縦横差6px以内）かつroot右端付近。実ブラウザで確認する。
- 「候補が1個だから」という根拠のないscore 1のfallbackは廃止。
- disabled / aria-disabled / 非表示を除外。aria-haspopup=menuは送信ラベルより優先して除外。
- 既存の多言語非送信ラベル（feedback/comment/report/attachment等）を常に優先して除外。
  aria-label、title、data-testid、data-test-id、name、value、textContentを既存方式で評価する。
  例: Send feedback、フィードバックを送信、aria-label=Send + data-testid=feedbackはすべて送信0。
- 識別できる候補が1個のときだけ送信。semantic候補1個とvisual候補1個も曖昧として送信0。

これらは既存DOM契約に基づくheuristicであり、実Perplexity UIの完全再現や任意の未知構造の安全を保証しない。
既知の入力とsendシグナルを持つ一般wrapperは対応し、MAIN直下や未知入力・未知ボタンは拒否する。
新しいサイト固有selectorや推測した送信ラベルは追加していない。

## 修正前の3件と根本原因

| fixture | 修正前の経路 | 安全契約 |
| --- | --- | --- |
| shared-inputs | rootにinput候補を列挙せず、共通sendをそのまま採用 | 有効入力2個では0 |
| unknown-button | score 1の未知ボタンを単一候補fallbackで採用 | 既知シグナルがなければ0 |
| send-feedback | known send labelがあるとexcluded labelを無視 | 非送信ラベルを優先し0 |

3件は修正前に実拡張でclick/submitCount=1を確認済み。
期待値は以前から0であり、今回も変更していない。skip/delete/expected failure化なし。
submitCountはfixture内の全ボタンへのclick action数で、実サービスへの送信数ではない。

## 実行

Node >=20（検証環境22.16.0）、@playwright/test 1.63.0、lockfile固定、devDependencyのみ。
package/config/helperは今回変更せず、前回追加したものを継続利用する。

```sh
npm ci --ignore-scripts
npx playwright install chromium
npm run test:unit
npm run test:browser
npm run test:all
```

npm testはUnitと同義。初回依存取得にはネット接続が必要だが、テスト実行はlocalhostだけで完結する。
Browser反復は同一コードに対してnpm run test:browserを3回別々に実行し、1回でも失敗すれば停止する。

## Browser構成・fixture

bundled Chromium / headless / persistent context / workers 1 / retry 0。
test timeout 30秒、expect timeout 5秒。固定sleepなし。
実content.js、popup、locale、iconを一時extensionへバイトコピーする。
一時manifestだけlocalhost matchesとstorage投入用workerを追加。本番manifestは非変更。
workerに送信・入力ロジックはない。Perplexityにhostname guardはないためlogical hostname差し替え不要。

ランダムloopback port、CSP、request routing、DNS制限で外部アクセスを遮断。
実サイト、Store API、login、Cookie export、storageState保存を利用しない。
各テストでJS/console error・想定外通信・Cookie残存がないことを検査する。
finallyでcontext/serverを閉じ、自分で作った一時profile・extensionを削除。
screenshot/video/traceはoff。検証後のtest-resultsも削除する。

19 HTMLは継続利用し、新しいDOM差分はspec内でfixtureに反映する。

| 分類 | fixture |
| --- | --- |
| 正常 | current、fallback-textarea、fallback-contenteditable、stale-valid |
| 独立composer | multiple-composers |
| 入力/rootなし・対象外 | no-input、hidden-only、unknown-root、unknown-input、login-modal |
| buttonなし・曖昧・非活性 | no-send、multiple-send、disabled-send、aria-disabled-send、hidden-send、excluded-button |
| 修正した安全条件 | shared-inputs、unknown-button、send-feedback |

currentはLexical型、unknown-rootはMAIN直下、unknown-inputは通常input[type=text]。
ホストfixtureのpage.jsはShift+Enterによる改行とclick観測のみを担当する。
本番拡張のshortcut判定やsend選択を代替しない。
Enter後の改行はDOMテキストの完全一致で確認する。

## テスト担当範囲

Unit: 既存24件 + 追加20件 = 44件。
実content.jsのclosureをメモリ上のコピーだけで公開し、DOMは最小tree/attribute adapterを使用する。
本番の入力・root・ボタン判定とhandleKeyからのclickを検証し、テスト側に選択ロジックを複製しない。
Windows/Macの6mode × 16修飾キー組合せ（192組合せ）、設定正規化、IME、改行イベント等の既存検証を維持。
追加は共有input、未知singleton、多言語feedback・data属性・menu除外、既知send各種、
独立context・focus、stale input4種、send ambiguity、外側rootへの迂回禁止、toolbar wrapper。

Browser: 既存27件 + 追加14件 = 41件。
正常currentの5shortcut、fallback2種、stale-valid、Enter改行、独立composer、fail closed14件、
無効化、合成shortcut無視、composition中抑止を維持。
追加はnested composer、同一rootのstale input4種、既知sendシグナル4種、
除外優先3種、semantic+visual曖昧性、toolbar wrapper。

IMEはUnitでisComposing、keyCode229、compositionstart/end、79ms/80ms境界を検証。
実OS IME、Mac実ブラウザ、実UI rollout、Spaces/Library/音声等は保証対象外。
過去版比較は今回追加実行していない。以前の実HEADで3件の失敗を確認した記録が回帰の根拠。

## 検証結果

2026-10-06検証:
- npm run test:unit: 44/44 PASS（既存24件 + 追加20件）
- npm run test:browser: 41/41 PASS（既存27件 + 追加14件）
- 同一コードのBrowser連続3実行: 41 + 41 + 41 = 123/123 PASS、retry 0
- npm run test:all: Unit 44件、Browser 41件PASS、終了コード0
- shared-inputs / unknown-button / send-feedback: 全てclick/submitCount=0
- current / fallback2種 / stale-valid: Enter改行とshortcut送信1回を維持
- IME既存検証PASS。JS error / 想定外通信 / Cookie残存なし
- Oops Manifest Validation / Permission Regression: PASS
- Oops check --require-baseline --strict: 終了コード0、PACKAGE_NOT_CHECKED INFOのみ
- 公開baseline 1.1.0、candidate manifest 1.1.0、permission差分なし
- flakyは今回の3回反復で観測なし。実サイトでの互換性検証は行っていない
- test-results、一時extension/profile、screenshot/video/trace残存なし

安全判定強化で変更したファイル（Playwrightテスト基盤を継続利用）:
content.js、README.md、tests/unit/content.test.cjs、tests/playwright/perplexity.spec.cjs、
tests/playwright/fixtures/page.css、tests/playwright/README.md。
テストされた契約範囲でcommitレビュー・Oops Test Runner/CIへの接続検討に進める。
この検証記録はアプリ側の安全契約を対象とし、Oops側の接続設定はOops repoで管理する。

## Oopsとの接続境界

今回はOops config / baseline / runner / CIを変更しない。
baselineは公開版1.1.0を維持。Manifest Validation、Permission Regression、require-baseline strictを確認する。
ZIP未指定INFOはZIP検査済みを意味しない。

推奨command:
- unit: ["npm", "run", "test:unit"]、timeout 60秒
- browser: ["npm", "run", "test:browser"]、timeout 180秒
- npm ci / Chromium取得はCI setupとしてテスト実行timeoutと分離

本番変更はcontent.jsのみ。manifest、version、permissions、matches、popup、locale、iconは非変更。
このテストはStore操作を行わず、他repoのコードやbaselineを変更しない。
