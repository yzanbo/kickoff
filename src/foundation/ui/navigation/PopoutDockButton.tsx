import { PanelLeft, PanelRight } from "lucide-react";
import { parsePopout, popoutKey, type PopoutRoute } from "./popout";
import { onWindowMessage, postToMainWindow } from "./windowBus";
import { flushNoteDrafts } from "@/features/notes/ui/noteGuards";
import { parsePanelKey } from "@/features/panel/ui/surfaces";
import { returnSideWindow } from "@/features/projects/ui/rightSidebar/PopoutRightSidebar";
import { returnTabWindow } from "@/features/panel/ui/popout/tabWindow";

/** 開き直し終えた知らせ（docked）を待つ上限（メインのウィンドウが応えなくても閉じる） */
const DOCK_WAIT_MS = 3000;

/** ボタンの名前と説明（戻す先の欄で変える） */
function dockLabel(route: PopoutRoute): { label: string; tip: string; left: boolean } {
  if (route.kind === "sidebar") return { label: "左の欄に戻す", tip: "メインのウィンドウのサイドバーを開いて、このウィンドウを閉じる", left: true };
  // ブラウザは右サイドバーだけに置くので、どこから移したものも右サイドバーへ戻す
  const surface = route.kind === "side" || route.kind === "browser" ? "side" : route.kind === "terminal" ? parsePanelKey(route.panel)?.surface : "agents";
  if (route.kind === "chats") return { label: "チャットのパネルに戻す", tip: "メインのウィンドウのチャットのパネルで開き直して、このウィンドウを閉じる", left: false };
  if (surface === "side") return { label: "右サイドバーに戻す", tip: "メインのウィンドウの右サイドバーで開き直して、このウィンドウを閉じる", left: false };
  if (surface === "bottom") return { label: "下のパネルに戻す", tip: "メインのウィンドウの下のパネルで開き直して、このウィンドウを閉じる", left: false };
  if (surface === "agents") return { label: "右の欄に戻す", tip: "メインのウィンドウの、チャットの画面の右の欄で開き直して、このウィンドウを閉じる", left: false };
  return { label: "元の欄に戻す", tip: "メインのウィンドウの元の欄で開き直して、このウィンドウを閉じる", left: false };
}

/** このウィンドウを閉じる */
const closeSelf = () => void (window.kickoff ? window.kickoff.windows.closeSelf() : window.close());

/**
 * 別ウィンドウの「右の欄に戻す」: 中身をメインのウィンドウのチャットの画面の右の欄（パネルのタブは元の欄）で開き直し（dockPopout）、
 * 開き直し終えた知らせを待ってから、このウィンドウを閉じる（ターミナルはシェルの持ち主をメインのウィンドウに移してから閉じる。閉じ方は聞かない。
 * ノートの書きかけは残してから閉じるので、右の欄で未保存のまま続きを書ける）。サイドバーは「左の欄に戻す」（メインのウィンドウのサイドバーを開く）
 */
export function PopoutDockButton({ route }: { route: PopoutRoute }) {
  const { label, tip, left } = dockLabel(route);
  return (
    <button
      type="button"
      className="btn"
      data-size="sm"
      title={tip}
      onClick={() => {
        // チャット欄は状態ごとメインのウィンドウに戻す（開いて戻す）
        if (route.kind === "side") return returnSideWindow(true);
        // タブの列のある別ウィンドウは、タブをすべて戻す（ブラウザは右サイドバー、チャットはチャットのパネル）
        if (route.kind === "browser" || route.kind === "chats") return returnTabWindow(route);
        flushNoteDrafts();
        // ブラウザはページを移ると URL のハッシュも変わるので、いまの行き先で戻す
        const current = parsePopout(location.hash) ?? route;
        const key = popoutKey(current);
        const timer = setTimeout(closeSelf, DOCK_WAIT_MS);
        onWindowMessage("docked", (m) => {
          if (m.key !== key) return;
          clearTimeout(timer);
          closeSelf();
        });
        postToMainWindow("dockPopout", { route: current });
      }}
    >
      {left ? <PanelLeft size={13} aria-hidden /> : <PanelRight size={13} aria-hidden />} {label}
    </button>
  );
}
