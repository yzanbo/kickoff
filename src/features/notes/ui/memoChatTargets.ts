// メモの本文の右クリック・本文で選んだときの上のボタン・見出しのボタンから、メモを足す先のチャット（開いたチャット・メモのチャット）と、選んだ文で始める新しいチャット
import type { MutableRefObject } from "react";
import type { Attachment } from "@shared/types";
import { lineLocation } from "@/foundation/ui/lib/pathCopy";
import { alertDialog, reportFailure } from "@/foundation/ui/kit/dialogs";
import { knownChat } from "@/features/chat/ui/store/knownChats";
import { chatTargetName } from "@/features/chat/ui/chatTitle";
import { attachMemoToChat } from "./attachMemo";
import { memoQuote } from "./memoAttachment";
import type { MemoChatHandle } from "./MemoChat";
import type { MemoChatTarget, MemoChatTargets, MemoNewChat } from "./useMemoEditMenu";
import { api } from "@/foundation/ui/api";
import { openSeededChat } from "@/features/chatPanel/ui/openSeededChat";

/**
 * 足す先ごとの口: 選んでいれば、ファイルのフルパスと行番号付きの引用を足し、なければメモ全体の写しを札で足す（AI は保存したファイルを読むので、
 * 書きかけは先に保存する）。addPath はメモのファイルのフルパスを足す。main は attachTo（開いたチャット）があるときだけ。
 * メモのチャットに足すときは、その欄を開く（openMemoChat）。newChat は選んだ文の引用を入れた新しいチャットを、メモのプロジェクトのチャットのパネルに開く
 * （本体・グループなしから。作業場所・グループは新しいチャットの見出しで選び直せる。送るのは自分で）。
 * 中で hook は使わないが、メモのチャットの欄の ref を受け取るので hook の名前にする（React Compiler は、ふつうの関数に ref を渡すと描く中で読むとみなして部品を最適化から外す）
 */
export function useMemoChatTargets({
  projectId,
  file,
  path,
  attachTo,
  save,
  memoChat,
  openMemoChat,
}: {
  projectId: number;
  /** メモのファイルのフルパス */
  file: string;
  /** メモのフォルダからのパス（メモの添付） */
  path: string;
  attachTo: number | null;
  save: () => Promise<boolean>;
  memoChat: MutableRefObject<MemoChatHandle | null>;
  openMemoChat: () => void;
}): MemoChatTargets {
  const savedForAttach = async () => {
    if (await save()) return true;
    void alertDialog("チャットに追加できませんでした", "メモを保存できなかったので、追加しませんでした（ほかで変わっていれば、上の案内で読み直すか上書きしてから追加してください）。");
    return false;
  };
  const quoteOf = (selection: string, lines: Parameters<typeof lineLocation>[1]) => memoQuote(lineLocation(file, lines), selection);
  const toMemoChat = (text: string, attachments?: Attachment[]) => {
    openMemoChat();
    memoChat.current?.add(text, attachments);
  };
  const memo: MemoChatTarget = {
    name: "メモのチャット",
    add: async (selection, lines) => {
      if (selection.trim()) toMemoChat(quoteOf(selection, lines));
      else if (await savedForAttach()) {
        await api.memoSnapshot(projectId, path).then((a) => toMemoChat("", [a]), reportFailure("メモをチャットに追加できませんでした"));
      }
    },
    addQuote: (quote) => toMemoChat(quote),
    addPath: () => toMemoChat(file),
  };
  const startQuote = (quote: string) => openSeededChat(projectId, { kind: "main" }, { text: quote });
  const newChat: MemoNewChat = {
    start: (selection, lines) => {
      if (selection.trim()) startQuote(quoteOf(selection, lines));
    },
    startQuote,
  };
  if (attachTo === null) return { memo, newChat };
  const main: MemoChatTarget = {
    name: chatTargetName(knownChat(attachTo)),
    add: async (selection, lines) => {
      if (selection.trim()) attachMemoToChat(attachTo, projectId, path, quoteOf(selection, lines));
      else if (await savedForAttach()) attachMemoToChat(attachTo, projectId, path);
    },
    addQuote: (quote) => attachMemoToChat(attachTo, projectId, path, quote),
    addPath: () => attachMemoToChat(attachTo, projectId, path, file),
  };
  return { main, memo, newChat };
}
