import { useEffect } from "react";
import { VIEWING_TTL_MS, type ViewingBody } from "@shared/notifications/types";
import { notificationsApi, reportLeaving } from "./api";
import { onServerOpen } from "@/foundation/ui/api/events";
import { useWindowEvent } from "@/foundation/ui/hooks/useWindowEvent";
import { useWindowFocused } from "@/foundation/ui/hooks/useWindowFocused";
import { type Route } from "@/foundation/ui/navigation/router";

/**
 * 通知（チャットの完了・失敗・回答待ち・CI の失敗）を出すかはコアが決める（src/features/notifications/core/center.ts。だれも見ていなければ、
 * この Mac の通知とつないだ端末のプッシュへ）。画面がするのは 2 つだけ: いま見ているものをコアに知らせる（ここの useViewingReport）と、
 * Mac の通知が押されたら、そのチャット・CI の実行を開く（notificationClicks.ts の useNotificationTargets）。
 * ブラウザで開いた画面の通知は、Web Push を作るまで出さない
 */

/** 見ているものの知らせを送り直す間隔（コアは VIEWING_TTL_MS で忘れるので、それより短く） */
const VIEWING_REFRESH_MS = VIEWING_TTL_MS / 3;

/** いま見ているもの（前に出していなければ何も見ていない） */
function viewingOf(route: Route, focused: boolean): ViewingBody {
  if (!focused) return { chat_id: null, ci_project_id: null };
  return {
    chat_id: route.name === "chat" ? route.chatId : null,
    ci_project_id: route.name === "project" && route.tab === "ci" ? route.id : null,
  };
}

/** いま見ているチャット・CI のタブをコアに知らせる（変わったとき・見ている間は少しずつ・SSE がつながり直したとき・窓を閉じたとき） */
export function useViewingReport(route: Route) {
  const focused = useWindowFocused();
  // 窓を閉じた・読み込み直したら、見ていないことをすぐ知らせる（知らせないと、古くなるまでの間そのチャットの通知が止まる）
  useWindowEvent("pagehide", () => reportLeaving());
  const { chat_id: chatId, ci_project_id: ciProjectId } = viewingOf(route, focused);
  useEffect(() => {
    const body: ViewingBody = { chat_id: chatId, ci_project_id: ciProjectId };
    const send = () => void notificationsApi("PUT /api/viewing", { body }).catch(() => {});
    send();
    const off = onServerOpen(send);
    // 何も見ていないなら送り直さない（コアは古い知らせを忘れる）
    const timer = chatId === null && ciProjectId === null ? undefined : setInterval(send, VIEWING_REFRESH_MS);
    return () => {
      off();
      clearInterval(timer);
    };
  }, [chatId, ciProjectId]);
}
