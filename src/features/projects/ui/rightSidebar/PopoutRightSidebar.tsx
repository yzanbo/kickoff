import { useEffect, useEffectEvent, useState } from "react";
import { popoutKey } from "@/foundation/ui/navigation/popout";
import { RouteContext, routeProjectId } from "@/foundation/ui/navigation/router";
import { postToMainWindow, postWindowMessage, subscribeWindowMessages } from "@/foundation/ui/navigation/windowBus";
import { useProjects } from "@/features/projects/ui/stores/projects";
import { adoptSidePanels, isSidePanel, ownSidePanelsOnly } from "@/features/panel/ui/state/panelHandOff";
import { panelActions } from "@/features/panel/ui/state/panelActions";
import { allPanels } from "@/features/panel/ui/state/panelStore";
import { panelKey } from "@/features/panel/ui/surfaces";
import { SideBody } from "./RightSidebar";
import { SideRail } from "./SideRail";
import { useFallbackProject } from "@/features/projects/ui/currentProject";
import { useMainWindowRoute } from "@/foundation/ui/navigation/useMainWindowRoute";

/** メインのウィンドウがチャット欄の状態を渡してくるのを待つ上限（過ぎたら空のまま描く） */
const ADOPT_WAIT_MS = 3000;
/** 戻し終えた知らせ（docked）を待つ上限（メインのウィンドウが応えなくても閉じる） */
const RETURN_WAIT_MS = 3000;

/** このウィンドウがチャット欄の状態を持っているか（受け取ったか。メインのウィンドウが読み込み直したら、渡し直さずにこのウィンドウのものを使ってもらう） */
let holding = false;

/** このウィンドウを閉じる */
const closeSelf = () => void (window.kickoff ? window.kickoff.windows.closeSelf() : window.close());

/**
 * チャット欄をメインのウィンドウに戻して、このウィンドウを閉じる（open: メインのウィンドウのチャット欄を開くか。「チャット欄に戻す」は開き、✕ は閉じたまま）。
 * メインのウィンドウがシェルの持ち主になってから閉じる（先に閉じると、このウィンドウが持つシェルが止まる）
 */
export function returnSideWindow(open: boolean) {
  const panels = [...allPanels()].filter(([key]) => isSidePanel(key));
  const key = popoutKey({ kind: "side" });
  const timer = setTimeout(closeSelf, RETURN_WAIT_MS);
  subscribeWindowMessages((m) => {
    if (m.type !== "docked" || m.key !== key) return;
    clearTimeout(timer);
    closeSelf();
  });
  holding = false;
  (open ? postToMainWindow : postWindowMessage)({ type: "returnSidePanels", panels, open });
}

/**
 * チャット欄の別ウィンドウの中身（メインのウィンドウの右サイドバーと同じ SideBody と、右端のアイコンの列を、ウィンドウいっぱいに）。
 * 開くとメインのウィンドウがチャット欄の状態（すべてのプロジェクトのタブ）をこのウィンドウに渡し、メインのウィンドウはチャット欄を描かない（panelHandOff.ts）。
 * 出すのはメインのウィンドウで開いているプロジェクトの欄（全プロジェクトの画面ならサイドバーで選んでいるもので、チャットは出さない）。
 * ✕ で閉じるとチャット欄をメインのウィンドウに戻す（閉じたまま。メインプロセスが閉じるのを止めて知らせる）
 */
export function PopoutSideChat() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    // 受け取るまでは、このウィンドウの下書きの保存でほかの欄を書き換えない
    ownSidePanelsOnly();
    // 届かなければ、空のまま描く（あとから届いたら受け取る）
    const timer = setTimeout(() => setReady(true), ADOPT_WAIT_MS);
    const off = subscribeWindowMessages((m) => {
      // メインのウィンドウから頼まれたブラウザのタブ（このウィンドウがチャット欄を持っている間）
      if (m.type === "sideOpenBrowser" && isSidePanel(m.panel)) return void panelActions(m.panel).openBrowser(m.url);
      // 受け取るのは 1 回だけ（同じ知らせが重ねて届いても、受け取ったあとのタブを消さない）
      if (m.type !== "sidePanels" || holding) return;
      clearTimeout(timer);
      holding = true;
      adoptSidePanels(m.panels);
      setReady(true);
    });
    return () => {
      clearTimeout(timer);
      off();
    };
  }, []);
  const route = useMainWindowRoute((open) => postWindowMessage({ type: "sideWindow", open, holding }));
  // ✕・⌘W（メインプロセスが閉じるのを止めて知らせる）: チャット欄をメインのウィンドウに戻してから閉じる
  const onCloseRequested = useEffectEvent(() => returnSideWindow(false));
  useEffect(() => window.kickoff?.windows.onCloseRequested(() => onCloseRequested()), []);
  const { missing } = useProjects();
  const fallbackProject = useFallbackProject();
  const routeProject = routeProjectId(route);
  const projectId = routeProject !== undefined && !missing(routeProject) ? routeProject : fallbackProject;
  // このウィンドウでは欄をいつも開いておく（閉じるボタン・右上の開閉はない）
  useEffect(() => {
    if (ready && projectId !== undefined) panelActions(panelKey("side", projectId)).setOpen(true);
  }, [ready, projectId]);
  if (!ready) return <div className="popout-body page muted">読み込み中…</div>;
  if (projectId === undefined) return <div className="popout-body page muted">プロジェクトがありません</div>;
  return (
    <RouteContext.Provider value={route}>
      <div className="popout-body popout-side-chat">
        <div className="popout-side-body">
          <SideBody projectId={projectId} />
        </div>
        <SideRail projectId={projectId} open inWindow />
      </div>
    </RouteContext.Provider>
  );
}
