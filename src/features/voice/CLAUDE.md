# 音声入力・音声モード・読み上げ（`src/features/voice`）

## 地図

- `core/service.ts`: `VoiceService` が設定の `voice_provider` で `local`（`whisper-cli`＋`ffmpeg`）/ `macos`（`core/macos.ts` の `macosSpeech`）/ `openai` に振り分ける。準備の確かめは `readiness.ts`、WebM は `webmToOgg.ts` で Ogg に詰め替える。
- macOS は補助コマンド `kickoff-speech`（`native/kickoff-speech/main.swift`）。取り決めは `@shared/voice/contract.ts`（モデルの表は `@shared/voice/models.ts`）。
- `ui/`: 入力欄への差し込み `ComposerVoice.tsx`（composer の `composerSlots` の `voice` に `ui/contributes.ts` が登録。文を書く欄 `MessageField` ごとのマイク・チャット欄の音声モード・新しいチャットからの引き継ぎ `claimHandoff`。hooks なので遅延読み込みにしない）。
- `ui/` のフォルダ: `capture/`（録音・声の見分け・音量 `levelChannel`・準備の確かめ `ensureVoiceReady`）・`dictation/`（マイク。入れ方 `insertDictation`）・`mode/`（音声モード `voiceSession.ts` は React に依存しない・読み上げ `speaker.ts`・読む文 `speakableText`）・`settings/`。呼び手は `ui/api.ts`、準備の状態は `ui/store.ts` の `useVoiceStatus`。

## 決まり

- `local` の一時フォルダは必ず消す。
- 送る前のチャットから音声モードを続けるときは `voiceHandoff.ts` で渡す（StrictMode の描き直しでも戻す）。
- 音量は描き直さずに CSS 変数に入れる（`useLevelVar`。マイクは `--mic-level`、音声モードの丸は `--voice-level`）。

## 落とし穴

- 長押しを離したのは window の pointerup で受ける（録音中はボタンが描き替わる）。
- 長い録音は `PART_BYTES` ごとに、次の録音を先に始めてから止めて区切る（文字起こしの 1 回は 25MB まで）。
- テストは `engines` / `findTools` / `speech` / `fetch` を差し替える（`core/routes.test.ts`）。
