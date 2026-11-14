import { useEffect } from "react";
import { VIEWING_TTL_MS, type ViewingBody } from "@shared/types";
import { api } from "@/api";
import { subscribeServerOpen } from "@/api/events";
import { openChatOrChild } from "@/features/chat/children/openChild";
import { openCiRun } from "@/features/ci/ciLinks";
import { useWindowFocused } from "@/hooks/useWindowFocused";
import { openChat, openMemo, type Route } from "./router";

/**
 * 通知（チャットの完了・失敗・回答待ち・CI の失敗）を出すかはコアが決める（src/core/notifications/center.ts。だれも見ていなければ、
 * この Mac の通知とつないだ端末のプッシュへ）。画面がするのは 2 つだけ: いま見ているものをコアに知らせる（useViewingReport）と、
 * Mac の通知が押されたら、そのチャット・CI の実行を開く（useNotificationTargets）。
 * ブラウザで開いた画面の通知は、Web Push を作るまで出さない（2026-11-14 に利用者と決めた）
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

/** いま見ているチャット・CI のタブをコアに知らせる（変わったとき・見ている間は少しずつ・SSE がつながり直したとき） */
export function useViewingReport(route: Route) {
  const focused = useWindowFocused();
  const { chat_id: chatId, ci_project_id: ciProjectId } = viewingOf(route, focused);
  useEffect(() => {
    const body: ViewingBody = { chat_id: chatId, ci_project_id: ciProjectId };
    const send = () => void api.reportViewing(body).catch(() => {});
    send();
    const off = subscribeServerOpen(send);
    // 何も見ていないなら送り直さない（コアは古い知らせを忘れる）
    const timer = chatId === null && ciProjectId === null ? undefined : setInterval(send, VIEWING_REFRESH_MS);
    return () => {
      off();
      clearInterval(timer);
    };
  }, [chatId, ciProjectId]);
}

/** Mac の通知が押されたら開く（チャットは子チャット・メモのチャットならその開き方で。Kickoff を起動し直したあとに前の通知が押されたときも） */
export function useNotificationTargets() {
  useEffect(() => {
    const offChat = window.kickoff?.notifications.onOpenChat((projectId, chatId) => void openNotifiedChat(projectId, chatId));
    const offCi = window.kickoff?.notifications.onOpenCi((projectId, runId) => openCiRun(projectId, runId));
    return () => {
      offChat?.();
      offCi?.();
    };
  }, []);
}

/** 通知のチャットを開く（子チャットなら設定の開き方、メモのチャットならそのメモ。読めなければいちばん上のチャットとして） */
async function openNotifiedChat(projectId: number, chatId: number) {
  const chat = await api.chatDetail(chatId, { limit: 1 }).then(
    (d) => d.chat,
    () => null,
  );
  if (!chat) return openChat(projectId, chatId);
  if (chat.memo_path !== null) return openMemo(chat.project_id, chat.memo_path);
  openChatOrChild(chat);
}
