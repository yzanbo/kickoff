# 音声入力・音声モード・読み上げ（`src/features/voice`）

## 地図

- `core/service.ts`: `VoiceService` が設定の `voice_provider` で `local`（`whisper-cli`＋`ffmpeg`）/ `macos`（`core/macos.ts` の `macosSpeech`）/ `openai` に振り分ける。準備の確かめは `readiness.ts`、WebM は `webmToOgg.ts` で Ogg に詰め替える。
- macOS は補助コマンド `kickoff-speech`（`native/kickoff-speech/main.swift`）。
- `ui/`: 欄に入れる音声入力 `useFieldDictation`（質問の「その他」・送信待ちの書き直す欄で共有）・入れ方 `insertDictation`・音声モード `voiceSession.ts`（React に依存しない）・読み上げる文 `speakableText`・準備の状態 `useVoiceStatus`・設定 `ui/settings/`。

## 決まり

- `local` の一時フォルダは必ず消す。
- 送る前のチャットから音声モードを続けるときは `voiceHandoff.ts` で渡す（StrictMode の描き直しでも戻す）。
- 音量は描き直さずに `--mic-level` に入れる（`useMicLevel`）。

## 落とし穴

- 長押しを離したのは window の pointerup で受ける（録音中はボタンが描き替わる）。
- 長い録音は `PART_BYTES` ごとに、次の録音を先に始めてから止めて区切る（文字起こしの 1 回は 25MB まで）。
- テストは `engines` / `findTools` / `speech` / `fetch` を差し替える（`core/routes/server.voice.test.ts`）。
