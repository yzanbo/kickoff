# スマホ連携（`features/devices`）

ペアリング・端末・Tailscale の案内・プッシュ。スマホのアプリは `mobile/CLAUDE.md`。受け入れの一覧: `docs/features.md` の `MOB-`。

## 地図
- `core/auth.ts`（`deviceAuth`。土台の `@/foundation/core/http/caller.ts` の `DeviceAuth`）・`core/pairing.ts`・`core/token.ts`・`core/db/devices.ts`・`core/tailscale.ts`・`core/pushSink.ts`
- 端末に開く口: 取り決めの `access` と `@/foundation/core/http/deviceAccess.ts`。この機能の口は `@shared/devices/contract.ts`
- `ui/footer/`（接続の札 `ConnectionFooterItem`・`useConnectionNotice`・`connectionLabel.ts`）・`ui/settings/`・`ui/api.ts`・`ui/native.ts`

## 決まり
- 呼び主はトークンだけで決める（本体 = この Mac、端末 = hash で引いた端末、ほかは 401）。相手のアドレス・Tailscale の見出しは信じない。本体のトークンは画面の外に出さない。
- 端末に開く口は取り決めの `access` から作る（既定で閉じる）。見るだけの端末は GET と `deviceRead` だけで、送れない。SSE も `access: "device"` の種類だけ届ける。
- スマホ連携がオフなら端末のトークンでも 403 `MOBILE_DISABLED`（つないでいる SSE も切る）。
- ペアリングの番号と頼みはメモリだけ。端末のトークンは表に hash だけを置き、1 回だけ渡す。

## 落とし穴
- 取り消したら SSE とターミナルの WebSocket もすぐ切る。
- 接続の札は、つながらないまま少し経ってから出す（一瞬の切断でちらつかせない）。
- テスト: `core/routes.test.ts`・`src/app/core/net/deviceAccess.test.ts`（記録 `device-routes.txt`）・`ui/footer/connectionLabel.test.ts`。
