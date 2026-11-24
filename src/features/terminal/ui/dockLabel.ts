// 別ウィンドウのターミナルを元の欄に戻すボタンの名前と説明（popoutKinds.ts の dockLabel）
import { parsePanelKey } from "@/features/panel/ui";
import type { PopoutDockLabel } from "@/foundation/ui/navigation/popout";

/** 戻す先の欄ごとの「戻す」ボタンの名前と説明 */
export function terminalDockLabel(panel: string): PopoutDockLabel {
  const surface = parsePanelKey(panel)?.surface;
  if (surface === "side") return { label: "右サイドバーに戻す", tip: "メインのウィンドウの右サイドバーで開き直して、このウィンドウを閉じる" };
  if (surface === "bottom") return { label: "下のパネルに戻す", tip: "メインのウィンドウの下のパネルで開き直して、このウィンドウを閉じる" };
  if (surface === "agents") return { label: "右の欄に戻す", tip: "メインのウィンドウの、チャットの画面の右の欄で開き直して、このウィンドウを閉じる" };
  return { label: "元の欄に戻す", tip: "メインのウィンドウの元の欄で開き直して、このウィンドウを閉じる" };
}
