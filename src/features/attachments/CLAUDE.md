# 添付と「AI に渡す」（`src/features/attachments`）

## 地図

- `core/uploads.ts`: 添付の置き場 `UploadStore`（保存先の `uploads/<id>/`）。表示のルートは `core/routes/uploads.ts`、ツールの画像は `core/toolImage.ts`。片付けは `@/features/chat/core/attachmentsCleanup.ts`。
- `ui/handoff/`: 「AI に渡す」。渡すものは各タブが `HandOffItem`（`handOff.ts`）で作る。ボタンは `HandOffButton`・項目は `HandOffItems`、渡し先は `HAND_OFF_TARGETS`。

## 決まり

- AI には中身でなくパスを添えて Read で読ませる。
- 「AI に渡す」の文は保存するときに鍵らしい値を伏せて切る。見出しは画面から届いた形でなく、保存した `.attachment.json` から書く。
- 渡す中身は押した時点で取る。どの渡し先も入力欄で止め、送るのは利用者。別ウィンドウからはメインのウィンドウに頼む（`openSeededChat`）。
- 表示（`GET /api/uploads/:id`）は画像と PDF だけ inline。ツールの画像は決めたフォルダの中だけ読む（理由はどちらもコードのコメント）。

## 落とし穴

- どこからも使われない添付（`store.events.uploadInUse`）は 30 日で片付ける。添付を指す所を足したら `uploadInUse` も直す。
