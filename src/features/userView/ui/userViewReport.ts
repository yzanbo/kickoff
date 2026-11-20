// このウィンドウで利用者が見ているものをコアに知らせる（AI の get_user_view）:
// 見ているものが変わったら（欄のタブ・画面・選んでいる範囲・押したもの。少しまとめて）と、見ている間は USER_VIEW_REPORT_MS ごとに知らせ直し、
// 窓を閉じる・読み込み直すときは「閉じた」を知らせる。送る指示にも、送った時点の様子を添える（lib/userViewSnapshot）
import { useEffect } from "react";
import { USER_VIEW_REPORT_MS, type UserView } from "@shared/userView/types";
import { api } from "@/foundation/ui/api";
import { onServerOpen } from "@/foundation/ui/api/events";
import { useLatest } from "@/foundation/ui/hooks/useLatest";
import { useWindowEvent } from "@/foundation/ui/hooks/useWindowEvent";
import { setUserViewProvider } from "@/features/chat/ui/send/userViewSnapshot";
import { subscribePanels } from "@/features/panel/ui/state/panelStore";

/** 続けて変わったときにまとめる間 */
const SETTLE_MS = 400;

/** ウィンドウごとの ID（読み込み直したら新しいウィンドウとして知らせる。前のものは閉じたと知らせてある） */
const WINDOW_ID = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `w-${Date.now()}-${Math.random()}`;

/**
 * collect: このウィンドウで見ているものを集める。chatIds: このウィンドウで開いているチャット（集めたものから決める）。
 * deps が変わったら（画面が変わった）知らせ直す
 */
export function useUserViewReport(collect: () => UserView, chatIds: (view: UserView) => number[], deps: unknown[]) {
  // 送る指示・時計・知らせから、いつも最新の集め方を呼ぶ
  const latest = useLatest({ collect, chatIds });
  // 送る指示に添える様子
  useEffect(() => setUserViewProvider(() => latest.current.collect()), []);
  // 窓を閉じた・読み込み直したら、このウィンドウを忘れてもらう（ページが消えても届くよう keepalive）
  useWindowEvent("pagehide", () => api.reportUserViewClosed(WINDOW_ID));
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const send = () => {
      clearTimeout(timer);
      const view = latest.current.collect();
      void api.reportUserView({ window_id: WINDOW_ID, view, chat_ids: latest.current.chatIds(view), focused: document.hasFocus() }).catch(() => {});
    };
    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(send, SETTLE_MS);
    };
    schedule();
    const offPanels = subscribePanels(schedule);
    const offOpen = onServerOpen(send);
    // 選んでいる範囲（エディタ・ノート）・押したもの（GitHub の issue・DB のタブなど、設定に覚えるもの）・窓の前後が変わったら
    const events = ["selectionchange", "pointerup", "keyup"] as const;
    for (const name of events) document.addEventListener(name, schedule, true);
    window.addEventListener("focus", schedule);
    window.addEventListener("blur", schedule);
    const interval = setInterval(send, USER_VIEW_REPORT_MS);
    return () => {
      clearTimeout(timer);
      offPanels();
      offOpen();
      for (const name of events) document.removeEventListener(name, schedule, true);
      window.removeEventListener("focus", schedule);
      window.removeEventListener("blur", schedule);
      clearInterval(interval);
    };
  }, deps);
}
