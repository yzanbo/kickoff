import type { OpenViewRequest } from "@shared/types";
import { useServerEvent } from "@/api/events";
import { addChats, knownChat } from "@/stores/chats";
import { openChildChat } from "@/features/chat/children/openChild";
import { openMemoFromChat } from "@/features/memo/openMemoFrom";
import { openChat } from "./router";

/** 系譜のうち、まだ読み込んでいないチャットを一覧に入れる（親をたどって、いちばん上の親の右の欄に開けるように） */
function learnLineage(lineage: OpenViewRequest["lineage"]) {
  const unknown = lineage.filter((c) => !knownChat(c.id));
  if (unknown.length > 0) addChats(unknown);
}

/** AI の頼み（open_view）を、画面のいまの開き方で開く */
function openRequested(request: OpenViewRequest) {
  learnLineage(request.lineage);
  const place = request.place ?? undefined;
  if (request.kind === "memo") {
    // 頼んだチャット（子チャットなら、いちばん上の親の右の欄。メモのチャットならメモのタブ）から開くのと同じ
    const from = request.lineage.at(-1);
    openMemoFromChat({ projectId: request.project_id, path: request.path, chatId: from?.id ?? null, place });
    return;
  }
  const target = request.lineage.at(-1);
  if (!target) return;
  if (target.parent_chat_id !== null) openChildChat(target, place);
  else openChat(target.project_id, target.id);
}

/**
 * チャットの AI がメモ・家系のチャットを開くよう頼んだら（コアの SSE `open_view`。kickoff_chat の open_memo・open_chat）、
 * 頼まれた場所（省けば設定の開き方）で開く。Mac のアプリのメインのウィンドウだけが受ける（別ウィンドウ・ほかのブラウザでは開かない。
 * 開いているウィンドウの数だけ開かないように）
 */
export function useAiOpenRequests() {
  useServerEvent((e) => {
    if (e.type !== "open_view" || !window.kickoff) return;
    openRequested(e.request);
  });
}
