# 添付と「AI に渡す」（`features/attachments`）

## 地図

- `core/uploads.ts`: 添付の置き場 `UploadStore`（保存先の `uploads/<id>/`）。表示のルートは `core/routes/uploads.ts`、ツールの画像は `core/toolImage.ts`（読んでよいフォルダは作業場所・添付の置き場と、上の機能が `addImageDir` で足すもの = ノートのフォルダ）。片付けは `core/attachmentsCleanup.ts`（`core/index.ts` の `createAttachments` がゴミ箱の片付けの段に足す）。送る文の見出しは `core/chatAttachments.ts`（chat の口 `ChatAttachments`）。
- `core/chatAttachments.ts` は回答の添付のパスと、本当に消したチャットの添付の片付けも（chat の `purgeChatsOf` が使われなくなった ID を渡す）。
- `ui/handoff/`: 「AI に渡す」。渡すものは各タブが `HandOffItem` で作る。ボタンは `HandOffButton`・項目は `HandOffItems`。渡し先は拡張点 `handOffTargets`（composer が this・thisPath・inner・innerPath・other、childChats が child、chatPanel が new を登録）。
- 開いた所（足す先のチャットと右の欄の中の子チャット・ノートのチャット）は `HandOffPlace`（決め方は chat の `addTargetsOf`）、`item.path` があればパスの渡し先（`hands: "path"`）も出る。コードの行の選択の引用は `codePick.ts` の `pickedInCode`。
- 札は骨組み `AttachmentCard` 1 つで、文は種類ごとの表 `ATTACHMENT_CARDS`（`attachmentCards.ts`）。出どころの名前と外かは `@shared/attachments/sources.ts` の `ATTACHMENT_SOURCE_LOOKS`。

## 決まり

- AI には中身でなくパスを添えて Read で読ませる。
- 「AI に渡す」の文は保存するときに鍵らしい値を伏せて切る。見出しは画面から届いた形でなく、保存した `.attachment.json` から書く。
- 渡す中身は押した時点で取る。どの渡し先も入力欄で止め、送るのは利用者。別ウィンドウからはメインのウィンドウに頼む（`appendToDraft`・`openSeededChat`）。
- 表示（`GET /api/uploads/:id`）は画像と PDF だけ inline。ツールの画像は決めたフォルダの中だけ読む（理由はどちらもコードのコメント）。

## 落とし穴

- どこからも使われない添付（`store.events.uploadInUse`）は 30 日で片付ける。添付を指す所を足したら `uploadInUse` も直す。
