// スマホ連携の設定
import { setting, type SettingTable } from "@shared/foundation/contract/settings";

export const devicesSettings = {
  /**
   * スマホ連携のオン・オフ（スマホからつなぐ）。オンのときだけ、端末の登録（ペアリング）を受け付け、つないだ端末からの頼みを受け、
   * 電源につないでいる間は本体を眠らせない。待ち受けは 127.0.0.1 のまま（外からは Tailscale Serve などを通す）。オフでも、つないだ端末の登録は残す
   */
  remote_enabled: setting({ default: false }),
  /** スマホ連携で端末がつなぐ先の URL（Tailscale Serve の https://<Mac の名前>.ts.net など。ペアリングの QR に入れる。null なら QR を出さず番号だけ） */
  mobile_url: setting<string | null>({ default: null }),
} as const satisfies SettingTable;
