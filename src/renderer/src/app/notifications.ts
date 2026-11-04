import { useEffect, useRef } from "react";
import type { Chat, ChatStatus } from "@shared/types";
import { chatTitle } from "@/features/chat/chatTitle";
import { useServerEvent } from "@/api/events";
import { openChat, type Route } from "./router";

/**
 * チャットの完了・失敗・回答待ちを、Mac の通知で知らせる。押すと Kickoff が前面に出て、そのチャットを開く。
 * Kickoff を見ていて、そのチャットを開いているときは知らせない。
 * デスクトップアプリではメインプロセスの通知で出す（画面を読み込み直しても・Kickoff を終えても通知センターに残り、
 * 起動し直したあとに押されてもそのチャットを開ける）。スマホのブラウザなどでは、ブラウザの通知で出す
 */
/** projectName: プロジェクト名の引き当て（ProjectsContext の projectName） */
export function useChatNotifications({ enabled, projectName, route }: { enabled: boolean; projectName: (id: number) => string; route: Route }) {
  // チャットごとの直前の状態（作業中 → 完了 に変わったときだけ知らせる）
  const last = useRef(new Map<number, ChatStatus>());
  const titles = useRef(new Map<number, string>());
  const state = useRef({ enabled, projectName, route });
  state.current = { enabled, projectName, route };

  const notify = (chat: Pick<Chat, "id" | "project_id">, title: string, body: string) => {
    const { enabled: on, route: current } = state.current;
    if (!on || (!window.kickoff && typeof Notification === "undefined")) return;
    const viewing = document.hasFocus() && current.name === "chat" && current.chatId === chat.id;
    if (viewing) return;
    if (window.kickoff) {
      void window.kickoff.notifications.notify({ title, body, chat: { projectId: chat.project_id, chatId: chat.id } });
      return;
    }
    const n = new Notification(title, { body, silent: false });
    n.onclick = () => {
      window.focus();
      openChat(chat.project_id, chat.id);
    };
  };
  // メインプロセスの通知が押されたら、そのチャットを開く
  useEffect(() => window.kickoff?.notifications.onOpenChat((projectId, chatId) => openChat(projectId, chatId)), []);

  useServerEvent((e) => {
    if (e.type === "chat") {
      const chat = e.chat;
      titles.current.set(chat.id, chat.title);
      const prev = last.current.get(chat.id);
      last.current.set(chat.id, chat.status);
      if (!prev || prev !== "running" || chat.status === "running") return;
      const project = state.current.projectName(chat.project_id);
      const name = chatTitle(chat.title);
      if (chat.status === "completed") notify(chat, `✓ 完了: ${name}`, `${project} ・ AI の作業が終わりました`);
      else if (chat.status === "failed") notify(chat, `✕ 失敗: ${name}`, `${project} ・ ${chat.error?.slice(0, 120) ?? "エラーで止まりました"}`);
    } else if (e.type === "approval") {
      const a = e.approval;
      const project = state.current.projectName(a.project_id);
      const name = titles.current.get(a.chat_id) || "チャット";
      const body =
        a.kind === "reconnect"
          ? "通信が切れて止まりました。再開するか選んでください"
          : a.kind === "usage_limit"
            ? "使用枠が戻りました。続きから再開するか選んでください"
            : "AI が確認を待っています";
      notify({ id: a.chat_id, project_id: a.project_id }, `回答待ち: ${name}`, `${project} ・ ${body}`);
    }
  });
}
