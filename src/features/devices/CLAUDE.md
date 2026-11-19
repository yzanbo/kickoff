# スマホ連携（ペアリング・端末・Tailscale・プッシュ）（`src/features/devices`）

## 端末とペアリング（`@/foundation/core/http/caller.ts`・`@/foundation/core/http/deviceAccess.ts`・`core/`）

- 呼び主はトークンだけで決める（本体のトークン = この Mac、端末のトークン = hash で引いた端末、ほかは 401）。相手のアドレス・Tailscale の見出しは信じない。本体のトークンは画面の外に出さない。
- スマホ連携がオフなら、端末のトークンでも 403 `mobile_off`（つないでいる SSE も切る）。
- 端末が使えるのは `@/foundation/core/http/deviceAccess.ts` の `DEVICE_ROUTES` の口だけ（見るだけの端末は GET と `READ_ONLY_DEVICE_ROUTES`）。口を足す・名前を変えたら一覧も直す（`server.devices.test.ts`）。
- 端末の SSE には `deviceMaySee` の種類だけ届ける（`open_view`・`chat_draft` と閉じた口の知らせは届けない）。
- ペアリング（`core/pairing.ts`）の番号と頼みはメモリだけ。端末のトークンは表に hash だけを置き、1 回だけ渡す。取り消したら SSE とターミナルの WebSocket もすぐ切る。Tailscale は案内だけ（`core/tailscale.ts`）。
