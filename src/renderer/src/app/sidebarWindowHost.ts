// メインのウィンドウ: サイドバーの別ウィンドウが開いている間、いまの画面とパネルの状態を写して送る
// （別ウィンドウのサイドバーは、開いているチャット・プロジェクトの強調、下書きの行、子チャットの行の「開いている」見た目をこれで決める）
import { useEffect, useState } from "react";
import { sendPanelsWhileChanging } from "@/features/panel/state/panelMirror";
import { href, type Route } from "./router";
import { postWindowMessage, subscribeWindowMessages } from "./windowBus";

/** サイドバーの別ウィンドウが開いた回数（開くたびの番号。effect を作り直しても前の番号と重ねない） */
let openedCount = 0;

export function useSidebarWindowHost(route: Route) {
  // 別ウィンドウが開いた（読み込み直した）たびに変わる番号（0 = 開いていない）。変わったら、いまの状態を送り直す。
  // 閉じたら 0 に戻すが、開くたびの番号は前と重ねない（「閉じた → 開いた」が続けて届き、まとめて描かれても前と同じ値にならないように。
  // 同じ値だと、作り直して中身が空になった別ウィンドウに送り直さない）
  const [session, setSession] = useState(0);
  useEffect(() => {
    const off = subscribeWindowMessages((m) => {
      if (m.type === "sidebarWindow") setSession(m.open ? ++openedCount : 0);
    });
    // 先に開いていた別ウィンドウに、このウィンドウが起動した（読み込み直した）ことを知らせる（開いていると知らせ直してもらう）
    postWindowMessage({ type: "mainWindowReady" });
    return off;
  }, []);
  useEffect(() => {
    if (session > 0) return sendPanelsWhileChanging();
  }, [session]);
  useEffect(() => {
    if (session > 0) postWindowMessage({ type: "mainRoute", hash: href(route) });
  }, [session, route]);
}
