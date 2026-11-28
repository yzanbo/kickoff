# チャット欄とノートの外の画像とリンク（`features/remoteImages`）

返答とノートに出る外の画像とリンク（許可したホストの画像だけをコアが取る。許可はチャットごと・ノートごと）。

## 地図

- `core/`: 受け口 `routes/chatImages.ts`・`routes/noteImages.ts`（取り決め `@shared/remoteImages/contract.ts`）・取る `fetchImage.ts`・手元と社内の宛先の見分け `addresses.ts`・取った画像の覚え `service.ts`（チャット）・`noteImageService.ts`（ノート）・許可のホスト（チャットごと・ノートごとに DB）。
- `ui/`: 返答の画像 `ChatImage.tsx`（読み込みは `useQuery`）・ノートの画像 `NoteImages.tsx`・許可の範囲（チャット 1 つかノート 1 つ）`imageScope.ts`・許可のホストの管理・取った画像の覚え `remoteImageCache.ts`（`createLruMap`。落ちたら blob を捨てる）。

## 決まり

- 返答の外の画像は、利用者が許可したホストのものだけをコアが代わりに取る。利用者が押すまで外へ通信しない・画面の CSP の `img-src` は開けない。
- Markdown の画像の描き方を入れるのは、チャットの画面の `ChatImagesProvider` と開いたノートの `NoteImagesProvider` だけ（ボタン・許可の管理は同じ部品で、範囲 `ImageScope` だけが違う）。
- ノートの許可は、ノートを動かしたら付け替え（覚えたファイルを先に動かしてから表を付け替える）、ゴミ箱に入れたら忘れる（ノートの機能が `RemoteImagesApi` を呼ぶ）。
- 「host から画像を n 件表示」の数と一覧（`sources`）は、Markdown の部品が描く木から数えて渡す（HTML の img も入る。たたむ部分の中は、開いたときにその部分の分として別に数える）。
- `fetchImage.ts` は手元・社内の宛先を断り、つなぐときも確かめた宛先を使う（名前の引き直しで変えさせない）。転送のたびに確かめ直す。口は端末に開かない。

## 落とし穴

- 画像は `<p>` の中に描かれるので、中に置けない要素は body に出し（`Popover` の `portal`）、中の押す操作は包むリンクに届かせない。失敗の文も span。
- 許可を外したら、そのホストの blob も捨てる（`forgetRemoteImages`）。
- 取った画像は分岐で `copyChat`、チャットを本当に消すときに `forgetChats`。
- テスト: `core/routes.test.ts`・`core/noteImages.test.ts`・`core/remoteImages.test.ts`・`ui/imageGroups.test.ts`。
