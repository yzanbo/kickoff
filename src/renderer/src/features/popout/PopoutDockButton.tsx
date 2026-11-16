import { PanelLeft, PanelRight } from "lucide-react";
import { parsePopout, popoutKey, type PopoutRoute } from "@/app/popout";
import { postToMainWindow, subscribeWindowMessages } from "@/app/windowBus";
import { flushMemoDrafts } from "@/features/memo/memoGuards";
import { parsePanelKey } from "@/features/panel/surfaces";
import { returnSideWindow } from "./PopoutSideChat";

/** 開き直し終えた知らせ（docked）を待つ上限（メインのウィンドウが応えなくても閉じる） */
const DOCK_WAIT_MS = 3000;

/** ボタンの名前と説明（戻す先の欄で変える） */
function dockLabel(route: PopoutRoute): { label: string; tip: string; left: boolean } {
  if (route.kind === "sidebar") return { label: "左の欄に戻す", tip: "メインのウィンドウのサイドバーを開いて、このウィンドウを閉じる", left: true };
  const surface = route.kind === "side" ? "side" : route.kind === "browser" || route.kind === "terminal" ? parsePanelKey(route.panel)?.surface : "agents";
  if (surface === "side") return { label: "チャット欄に戻す", tip: "メインのウィンドウの右端のチャット欄で開き直して、このウィンドウを閉じる", left: false };
  if (surface === "bottom") return { label: "下のパネルに戻す", tip: "メインのウィンドウの下のパネルで開き直して、このウィンドウを閉じる", left: false };
  if (surface === "agents") return { label: "右の欄に戻す", tip: "メインのウィンドウの、チャットの画面の右の欄で開き直して、このウィンドウを閉じる", left: false };
  return { label: "元の欄に戻す", tip: "メインのウィンドウの元の欄で開き直して、このウィンドウを閉じる", left: false };
}

/** このウィンドウを閉じる */
const closeSelf = () => void (window.kickoff ? window.kickoff.windows.closeSelf() : window.close());

/**
 * 別ウィンドウの「右の欄に戻す」: 中身をメインのウィンドウのチャットの画面の右の欄（パネルのタブは元の欄）で開き直し（dockPopout）、
 * 開き直し終えた知らせを待ってから、このウィンドウを閉じる（ターミナルはシェルの持ち主をメインのウィンドウに移してから閉じる。閉じ方は聞かない。
 * メモの書きかけは残してから閉じるので、右の欄で未保存のまま続きを書ける）。サイドバーは「左の欄に戻す」（メインのウィンドウのサイドバーを開く）
 */
export function PopoutDockButton({ route }: { route: PopoutRoute }) {
  const { label, tip, left } = dockLabel(route);
  return (
    <button
      type="button"
      className="btn btn-sm"
      title={tip}
      onClick={() => {
        // チャット欄は状態ごとメインのウィンドウに戻す（開いて戻す）
        if (route.kind === "side") return returnSideWindow(true);
        flushMemoDrafts();
        // ブラウザはページを移ると URL のハッシュも変わるので、いまの行き先で戻す
        const current = parsePopout(location.hash) ?? route;
        const key = popoutKey(current);
        const timer = setTimeout(closeSelf, DOCK_WAIT_MS);
        subscribeWindowMessages((m) => {
          if (m.type !== "docked" || m.key !== key) return;
          clearTimeout(timer);
          closeSelf();
        });
        postToMainWindow({ type: "dockPopout", route: current });
      }}
    >
      {left ? <PanelLeft size={13} aria-hidden /> : <PanelRight size={13} aria-hidden />} {label}
    </button>
  );
}
