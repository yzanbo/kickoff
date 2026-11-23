# スマホ連携（ペアリング・端末・Tailscale・プッシュ）（`src/features/devices`）

## 端末とペアリング（`@/foundation/core/http/caller.ts`・`@/foundation/core/http/deviceAccess.ts`・`core/`）

- 呼び主はトークンだけで決める（本体のトークン = この Mac、端末のトークン = hash で引いた端末（`core/auth.ts` の `deviceAuth` が土台の `DeviceAuth` を実装）、ほかは 401）。呼び主は端末の ID だけを持ち、中身は店で引き直す。相手のアドレス・Tailscale の見出しは信じない。本体のトークンは画面の外に出さない。
- スマホ連携（設定 `mobile_enabled`）がオフなら、端末のトークンでも 403 `MOBILE_DISABLED`（断る印は `@shared/foundation/api/deviceRefusals`。つないでいる SSE も切る）。
- 端末が使えるのは取り決めの `access` と、まだ乗せていない口の表（`deviceAccess.ts` の `LEGACY_DEVICE_ROUTES`）の口だけ（見るだけの端末は GET と `deviceRead`）。開いた口は記録 `device-routes.txt`。この機能の口は `@shared/devices/contract.ts`（`/pairing/…` は `public`、端末だけの口は `deviceCaller` で 400）。
- 端末の SSE には、機能の SSE の表で `access: "device"` の種類だけ届ける（`open_view`・`chat_draft` と閉じた口の知らせは届けない）。
- 下の帯の接続の札（`ui/ConnectionFooterItem.tsx`。状態は土台の `useConnectionState`）は、つながらないまま少し経ってから出す（`useConnectionNotice`。一瞬の切断でちらつかせない）。
- ペアリング（`core/pairing.ts`）の番号と頼みはメモリだけ。端末のトークンは表に hash だけを置き（hash にするのは店 `core/db/devices.ts`。`core/token.ts`）、1 回だけ渡す。取り消したら SSE とターミナルの WebSocket もすぐ切る。Tailscale は案内だけ（`core/tailscale.ts`）。
