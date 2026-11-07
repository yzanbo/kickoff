// メモの本文の右クリック・本文で選んだときの上のボタン・見出しのボタンから、メモを足す先のチャット（開いたチャット・メモのチャット）
import type { MutableRefObject } from "react";
import { lineLocation } from "@/lib/pathCopy";
import { alertDialog } from "@/ui/dialogs";
import { knownChat } from "@/stores/chats";
import { chatTargetName } from "@/features/chat/chatTitle";
import { attachMemoToChat } from "./attachMemo";
import { memoAttachment, memoQuote } from "./memoAttachment";
import type { MemoChatHandle } from "./MemoChat";
import type { MemoChatTarget } from "./useMemoEditMenu";

/**
 * 足す先ごとの口: 選んでいれば、ファイルのフルパスと行番号付きの引用を足し、なければメモ全体を添付する（AI は保存したファイルを読むので、
 * 書きかけは先に保存する）。addPath はメモのファイルのフルパスを足す。main は attachTo（開いたチャット）があるときだけ。
 * メモのチャットに足すときは、その欄を開く（openMemoChat）
 */
export function memoChatTargets({
  file,
  path,
  attachTo,
  save,
  memoChat,
  openMemoChat,
}: {
  /** メモのファイルのフルパス */
  file: string;
  /** メモのフォルダからのパス（メモの添付） */
  path: string;
  attachTo: number | null;
  save: () => Promise<boolean>;
  memoChat: MutableRefObject<MemoChatHandle | null>;
  openMemoChat: () => void;
}): { main?: MemoChatTarget; memo: MemoChatTarget } {
  const savedForAttach = async () => {
    if (await save()) return true;
    void alertDialog("添付できませんでした", "メモを保存できなかったので、添付しませんでした（ほかで変わっていれば、上の案内で読み直すか上書きしてから添付してください）。");
    return false;
  };
  const quoteOf = (selection: string, lines: Parameters<typeof lineLocation>[1]) => memoQuote(lineLocation(file, lines), selection);
  const toMemoChat = (text: string, attachments?: ReturnType<typeof memoAttachment>[]) => {
    openMemoChat();
    memoChat.current?.add(text, attachments);
  };
  const memo: MemoChatTarget = {
    name: "メモのチャット",
    add: async (selection, lines) => {
      if (selection.trim()) toMemoChat(quoteOf(selection, lines));
      else if (await savedForAttach()) toMemoChat("", [memoAttachment(path)]);
    },
    addQuote: (quote) => toMemoChat(quote),
    addPath: () => toMemoChat(file),
  };
  if (attachTo === null) return { memo };
  const main: MemoChatTarget = {
    name: chatTargetName(knownChat(attachTo)),
    add: async (selection, lines) => {
      if (selection.trim()) attachMemoToChat(attachTo, path, quoteOf(selection, lines));
      else if (await savedForAttach()) attachMemoToChat(attachTo, path);
    },
    addQuote: (quote) => attachMemoToChat(attachTo, path, quote),
    addPath: () => attachMemoToChat(attachTo, path, file),
  };
  return { main, memo };
}
