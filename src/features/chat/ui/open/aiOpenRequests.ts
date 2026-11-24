import type { Chat } from "@shared/chat/types";
import type { OpenViewRequest } from "@shared/chat/openView";
import { useServerEvent } from "@/foundation/ui/api/events";
import { addChats, knownChat } from "@/features/chat/ui/store/knownChats";
import { openInRootSide } from "./openChat";
import { rootChatOf } from "@/features/chat/ui/state/descendants";
import { canPopout, openPopout } from "@/foundation/ui/navigation/popout";
import { open } from "@/foundation/ui/navigation/open";
import { changesTab, fileTab, openTab, reopenOf } from "@/features/panel/ui";
import { inDesktopApp } from "@/foundation/ui/lib/desktopApp";

declare module "@/foundation/ui/navigation/open" {
  interface OpenTargetMap {
    /** そのチャット（子チャットなら、いちばん上の親）の右の欄の DB クライアントの新しい SQL のタブに sql を入れて開く（受け手は database） */
    databaseSql: { chat: Pick<Chat, "id" | "project_id" | "parent_chat_id" | "worktree_path">; connectionId: number; sql: string };
  }
}

/** 系譜のうち、まだ読み込んでいないチャットを一覧に入れる（親をたどって、いちばん上の親の右の欄に開けるように） */
function learnLineage(lineage: OpenViewRequest["lineage"]) {
  const unknown = lineage.filter((c) => !knownChat(c.id));
  if (unknown.length > 0) addChats(unknown);
}

/** ファイル・差分を、頼んだチャット（子チャットなら、いちばん上の親）の右の欄か別ウィンドウで開く（place を省けば右の欄。返答のファイルのチップと同じ） */
function openWorkFile(request: Extract<OpenViewRequest, { kind: "file" | "diff" }>) {
  const from = request.lineage.at(-1);
  if (!from) return;
  const root = rootChatOf(from, (id) => knownChat(id));
  const target = { projectId: request.project_id, ...(request.worktree ? { worktree: request.worktree } : {}) };
  const name = (request.path ?? "変更").split("/").pop();
  if (request.place === "window" && canPopout()) {
    if (request.kind === "file") return openPopout({ kind: "file", chatId: root.id, ...target, path: request.path, ...(request.line ? { line: request.line } : {}) }, `${name} — ファイル`);
    return openPopout({ kind: "changes", chatId: root.id, ...target, ...(request.path ? { focus: request.path } : {}) }, "変更");
  }
  const opened = openInRootSide(from.id, (rootId, side) => {
    const tab =
      request.kind === "file"
        ? fileTab({ chatId: rootId, ...target, path: request.path, ...(request.line ? { line: request.line } : {}) })
        : changesTab({ chatId: rootId, ...target, ...(request.path ? { focus: request.path } : {}) });
    openTab(side, tab, reopenOf(tab));
  });
  // 右の欄を置けない（親が分からない）ときはファイルタブ
  if (!opened && request.kind === "file") open({ kind: "file", projectId: request.project_id, path: request.path, line: request.line ?? undefined, worktree: request.worktree });
}

/** AI の頼み（open_view）を、画面のいまの開き方で開く */
function openRequested(request: OpenViewRequest) {
  learnLineage(request.lineage);
  if (request.kind === "note") {
    // 頼んだチャット（子チャットなら、いちばん上の親の右の欄。ノートのチャットならノートのタブ）から開くのと同じ
    const from = request.lineage.at(-1);
    open({ kind: "note", projectId: request.project_id, path: request.path, ...(request.place ? { place: request.place } : {}) }, { fromChatId: from?.id ?? null });
    return;
  }
  if (request.kind === "file" || request.kind === "diff") return openWorkFile(request);
  const target = request.lineage.at(-1);
  if (!target) return;
  // SQL は、頼んだチャットの右の欄の DB クライアントの新しい SQL のタブ（ツールの行の「SQL のタブで開く」と同じ）
  if (request.kind === "sql") return void open({ kind: "databaseSql", chat: target, connectionId: request.connection_id, sql: request.sql });
  // 子チャットは選んだ場所（省けば設定の開き方）、親のないチャットはチャットのパネル
  open({ kind: "chat", projectId: target.project_id, chatId: target.id, place: target.parent_chat_id !== null ? (request.place ?? "auto") : "tab" });
}

/**
 * チャットの AI がノート・家系のチャット・ファイル・差分・SQL を開く（コアの SSE `open_view`）よう頼んだら、
 * 頼まれた場所（省けば設定の開き方）で開く・入れる。Mac のアプリのメインのウィンドウだけが受ける（別ウィンドウ・ほかのブラウザでは開かない。
 * 開いているウィンドウの数だけ開かないように）
 */
export function useAiOpenRequests() {
  useServerEvent("open_view", (e) => {
    if (inDesktopApp()) openRequested(e.request);
  });
}
