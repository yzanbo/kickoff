// メインのウィンドウ: サイドバー・チャット欄の別ウィンドウの受け口。開いている間、いまの画面を写して送り（どちらも、開いているプロジェクト・チャットに合わせるため）、
// サイドバーにはパネルの状態の写しを、チャット欄にはチャット欄の状態そのものを渡す（features/panel/state/panelMirror.ts・panelHandOff.ts）
import { useEffect, useState } from "react";
import { useLatest } from "@/foundation/ui/hooks/useLatest";
import { sendPanelsWhileChanging } from "@/features/panel/ui/state/panelMirror";
import { handSidePanelsOut, ownSidePanelsAgain, takeSidePanelsBack } from "@/features/panel/ui/state/panelHandOff";
import { panelActions } from "@/features/panel/ui/state/panelActions";
import { panelKey } from "@/features/panel/ui/surfaces";
import { popoutKey, popoutPath } from "@/foundation/ui/navigation/popout";
import { href, routeProjectId, type Route } from "@/foundation/ui/navigation/router";
import { onWindowMessage, postWindowMessage } from "@/foundation/ui/navigation/windowBus";

/** 別ウィンドウが開いた回数（開くたびの番号。effect を作り直しても前の番号と重ねない） */
let openedCount = 0;
/** 次の番号（hook の中でモジュールの変数を直に書き換えない。React Compiler が扱えないため） */
const nextOpened = () => ++openedCount;

/**
 * 返すのは、チャット欄を別ウィンドウへ移しているか（このウィンドウのチャット欄は描かない）。
 * 開くたびの番号（0 = 開いていない）が変わったら、いまの状態を送り直す（「閉じた → 開いた」が続けて届き、まとめて描かれても前と同じ値にならないよう、番号は重ねない）
 */
export function usePopoutHosts(route: Route): { sideHeld: boolean } {
  const [sidebar, setSidebar] = useState(0);
  const [side, setSide] = useState(0);
  // 戻されたときに開くチャット欄のプロジェクト（知らせを受けたときのいまの画面）
  const latestRoute = useLatest(route);
  useEffect(() => {
    const offs = [
      onWindowMessage("sidebarWindow", (m) => setSidebar(m.open ? nextOpened() : 0)),
      onWindowMessage("sideWindow", (m) => {
        if (m.open) handSidePanelsOut(m.holding);
        else ownSidePanelsAgain();
        setSide(m.open ? nextOpened() : 0);
      }),
      onWindowMessage("returnSidePanels", (m) => {
        // 戻されたチャット欄を受け取り（シェルの持ち主をこのウィンドウに）、開くなら開いてから、別ウィンドウに閉じてよいと知らせる
        const projectId = routeProjectId(latestRoute.current);
        void takeSidePanelsBack(m.panels).finally(() => {
          // 「チャット欄に戻す」はいまのプロジェクトの欄を開き、✕ は閉じたまま戻す（別ウィンドウではいつも開いていたので、どの欄も閉じる）
          for (const [key] of m.panels) panelActions(key).setOpen(false);
          if (m.open && projectId !== null) panelActions(panelKey("side", projectId)).setOpen(true);
          setSide(0);
          postWindowMessage("docked", { key: popoutKey({ kind: "side" }) });
        });
      }),
    ];
    // 別ウィンドウが閉じた（メインプロセスから。落ちた・画面が知らせられずに閉じたときも）: 移したままにしない。チャット欄は、戻されずに閉じたなら
    // 状態はなくなっているので、このウィンドウでまた持つ（✕ はメインプロセスが止めて、戻してから閉じる）
    const offClosed = window.kickoff?.windows.onPopoutClosed((closed) => {
      if (closed === popoutPath({ kind: "sidebar" })) setSidebar(0);
      else if (closed === popoutPath({ kind: "side" })) {
        ownSidePanelsAgain();
        setSide(0);
      }
    });
    // 先に開いていた別ウィンドウに、このウィンドウが起動した（読み込み直した）ことを知らせる（開いていると知らせ直してもらう）
    postWindowMessage("mainWindowReady", null);
    return () => {
      for (const off of offs) off();
      offClosed?.();
    };
  }, []);
  useEffect(() => {
    if (sidebar > 0) return sendPanelsWhileChanging();
  }, [sidebar]);
  useEffect(() => {
    if (sidebar > 0 || side > 0) postWindowMessage("mainRoute", { hash: href(route) });
  }, [sidebar, side, route]);
  return { sideHeld: side > 0 };
}
