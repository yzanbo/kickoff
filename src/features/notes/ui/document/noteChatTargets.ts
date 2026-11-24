// ノートの本文の右クリック・本文で選んだときの上のボタン・見出しのボタンから、ノートを足す先のチャット（開いたチャット・ノートのチャット）と、選んだ文で始める新しいチャット。
// 足す先は並べる順の配列（chats）まで作り、3 か所はそれを描くだけ
import type { MutableRefObject } from "react";
import type { Attachment } from "@shared/chat/types";
import { lineLocation } from "@/foundation/ui/lib/pathCopy";
import { alert, reportFailure } from "@/foundation/ui/kit/ask";
import { chatTargetName, knownChat } from "@/features/chat/ui";
import { attachNoteToChat } from "@/features/notes/ui/links/attachNote";
import { noteQuote } from "./noteAttachment";
import type { NoteChatHandle } from "@/features/notes/ui/chat/NoteChat";
import type { NoteChatTarget, NoteChatTargets, NoteNewChat } from "./useNoteEditMenu";
import { notesApi } from "@/features/notes/ui/api";
import { openSeededChat } from "@/features/chatPanel/ui";
import { screenProjectFor } from "@/features/notes/ui/commonNotes";

/**
 * 足す先ごとの口: 選んでいれば、ファイルのフルパスと行番号付きの引用を足し、なければノート全体の写しを札で足す（AI は保存したファイルを読むので、
 * 書きかけは先に保存する）。addPath はノートのファイルのフルパスを足す。main は attachTo（開いたチャット）があるときだけ。
 * ノートのチャットに足すときは、その欄を開く（openNoteChat）。newChat は選んだ文の引用を入れた新しいチャットを、ノートのプロジェクト（共通のノートなら、いま見ているプロジェクト）のチャットのパネルに開く
 * （本体・グループなしから。作業場所・グループは新しいチャットの見出しで選び直せる。送るのは自分で）。
 * 中で hook は使わないが、ノートのチャットの欄の ref を受け取るので hook の名前にする（React Compiler は、ふつうの関数に ref を渡すと描く中で読むとみなして部品を最適化から外す）
 */
export function useNoteChatTargets({
  projectId,
  file,
  path,
  attachTo,
  save,
  noteChat,
  openNoteChat,
}: {
  projectId: number;
  /** ノートのファイルのフルパス */
  file: string;
  /** ノートのフォルダからのパス（ノートの添付） */
  path: string;
  attachTo: number | null;
  save: () => Promise<boolean>;
  noteChat: MutableRefObject<NoteChatHandle | null>;
  openNoteChat: () => void;
}): NoteChatTargets {
  const savedForAttach = async () => {
    if (await save()) return true;
    void alert("チャットに追加できませんでした", "ノートを保存できなかったので、追加しませんでした（ほかで変わっていれば、上の案内で読み直すか上書きしてから追加してください）。");
    return false;
  };
  const quoteOf = (selection: string, lines: Parameters<typeof lineLocation>[1]) => noteQuote(lineLocation(file, lines), selection);
  const toNoteChat = (text: string, attachments?: Attachment[]) => {
    openNoteChat();
    noteChat.current?.add(text, attachments);
  };
  const note: NoteChatTarget = {
    name: "ノートのチャット",
    add: async (selection, lines) => {
      if (selection.trim()) toNoteChat(quoteOf(selection, lines));
      else if (await savedForAttach()) {
        await notesApi("POST /api/projects/:projectId/note/snapshot", { params: { projectId }, body: { path } }).then((a) => toNoteChat("", [a]), reportFailure("ノートをチャットに追加できませんでした"));
      }
    },
    addQuote: (quote) => toNoteChat(quote),
    addPath: () => toNoteChat(file),
  };
  // 共通のノート（見えないプロジェクト）にはチャットのパネルがないので、いま見ているプロジェクトで始める
  const startQuote = (quote: string) => {
    const chatProject = screenProjectFor(projectId);
    if (chatProject !== undefined) openSeededChat(chatProject, { kind: "main" }, { text: quote });
  };
  const newChat: NoteNewChat = {
    start: (selection, lines) => {
      if (selection.trim()) startQuote(quoteOf(selection, lines));
    },
    startQuote,
  };
  if (attachTo === null) return { chats: [note], newChat };
  const main: NoteChatTarget = {
    name: chatTargetName(knownChat(attachTo)),
    add: async (selection, lines) => {
      if (selection.trim()) attachNoteToChat(attachTo, projectId, path, quoteOf(selection, lines));
      else if (await savedForAttach()) attachNoteToChat(attachTo, projectId, path);
    },
    addQuote: (quote) => attachNoteToChat(attachTo, projectId, path, quote),
    addPath: () => attachNoteToChat(attachTo, projectId, path, file),
  };
  return { main, chats: [main, note], newChat };
}
