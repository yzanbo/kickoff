// voice の画面の保存（キーは kickoff:voice:<名前の kebab>。ほかの機能が読むものは ui/index.ts から出す）
import { choice, defineSettings, text } from "@/foundation/ui/storage";

export const storage = defineSettings("voice", {
  /** 音声入力・音声モードで使うマイク（MediaDeviceInfo.deviceId。空なら Mac の既定のマイク。マイクの ▾ で選ぶ。見つからなければ既定のマイクで録る） */
  micDevice: text(),
  /**
   * 音声モードで話し終わったときの扱い（send = すぐ送る（AI が作業中なら、いま / あとでの送り方 composer:queue-mode で）/
   * fill = チャット欄に入れて残す（自分で直して Enter で送る）。音声モードの帯で切り替える。どのチャットでも同じ）
   */
  modeDelivery: choice(["send", "fill"], "send"),
});
