import { AppWindow } from "lucide-react";
import { IconButton } from "@/ui/IconButton";
import { useTabPage } from "./tabPageContext";

/**
 * 「別ウィンドウで開く」のボタン。チャットの画面の右の欄のタブ（サブエージェント・子チャット・メモ・変更・ファイル）の中身の、
 * いちばん上の見出しの行の右端に置く（どのタブでも同じ位置。タブの列の左の道具から移した）。別ウィンドウで開けないとき
 * （パネルの外・別ウィンドウの中・ブラウザ）は何も出さない
 */
export function PopOutTabButton() {
  const popOut = useTabPage()?.popOut;
  if (!popOut) return null;
  return <IconButton type="button" icon={AppWindow} size={14} className="tab-popout-button" label="別ウィンドウで開く" onClick={popOut} />;
}
