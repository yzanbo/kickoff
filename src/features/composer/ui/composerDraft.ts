// 入力欄の下書きの店（書きかけの文と送る前の添付。残す先ごとに 1 つ。入力欄も外から足す口も、これだけを読み書きする）
import { useSyncExternalStore } from "react";
import type { Attachment } from "@shared/chat/types";
import { readSetting, subscribeSetting, writeSetting, type Setting } from "@/foundation/ui/storage";
import { createSignal } from "@/foundation/ui/store";
import { appendBlock } from "@/features/chat/ui";
import { mergeAttachments } from "@/features/attachments/ui";
import { storage } from "./storage";

export interface DraftValue {
  text: string;
  /** アップロードできた添付（アップロードの途中のものは入力欄だけが持つ） */
  attachments: readonly Attachment[];
}

export interface ComposerDraft {
  /** 残す先の名前（変わったら、入力欄はその先の中身に入れ替える） */
  readonly id: string;
  read(): DraftValue;
  write(next: Partial<DraftValue>): void;
  /** 中身が変わったら知らせる（ほかの入力欄・外から足したとき） */
  subscribe(listener: () => void): () => void;
}

const NO_ATTACHMENTS: readonly Attachment[] = [];

/** 作った店（同じ残す先には同じものを返す。描くたびに作り直すと購読し直しになる） */
const settingDrafts = new Map<string, ComposerDraft>();

/** 設定（localStorage）に残す下書き（文と、渡せば添付。ほかの入力欄・別ウィンドウの書き換えも知らせる） */
export function settingDraft(text: Setting<string>, attachments?: Setting<readonly Attachment[]>): ComposerDraft {
  const id = attachments ? `${text.key}\n${attachments.key}` : text.key;
  const known = settingDrafts.get(id);
  if (known) return known;
  const draft: ComposerDraft = {
    id,
    read: () => ({ text: readSetting(text), attachments: attachments ? readSetting(attachments) : NO_ATTACHMENTS }),
    write: (next) => {
      if (next.text !== undefined) writeSetting(text, next.text);
      if (next.attachments !== undefined && attachments) writeSetting(attachments, next.attachments);
    },
    subscribe: (listener) => {
      const offText = subscribeSetting(text, listener);
      const offAttachments = attachments ? subscribeSetting(attachments, listener) : undefined;
      return () => {
        offText();
        offAttachments?.();
      };
    },
  };
  settingDrafts.set(id, draft);
  return draft;
}

/** 既存のチャットの下書き（チャットの画面・ノートの下の入力欄が同じものを使う） */
export const chatComposerDraft = (chatId: number): ComposerDraft => settingDraft(storage.settings.draft(chatId), storage.settings.attachments(chatId));

let memorySeq = 0;

/**
 * 残さない下書き（新しい子チャット・預かった指示の書き直しなど）。onWrite を渡すと、書くたびに中身を渡す（新しいチャットのタブに添付を残す）
 */
export function memoryDraft(initial: Partial<DraftValue> = {}, onWrite?: (value: DraftValue, next: Partial<DraftValue>) => void): ComposerDraft {
  let value: DraftValue = { text: initial.text ?? "", attachments: initial.attachments ?? NO_ATTACHMENTS };
  const changed = createSignal<void>();
  return {
    id: `memory:${++memorySeq}`,
    read: () => value,
    write: (next) => {
      value = { text: next.text ?? value.text, attachments: next.attachments ?? value.attachments };
      onWrite?.(value, next);
      changed.emit();
    },
    subscribe: (listener) => changed.subscribe(listener),
  };
}

/** 書いている文の後ろに空行を挟んで足し、添付は同じものを入れ替えて足す（文が空なら文はそのまま） */
export function appendDraft(draft: ComposerDraft, text: string, attachments: readonly Attachment[] = []) {
  const now = draft.read();
  draft.write({
    ...(text ? { text: appendBlock(now.text, text) } : {}),
    ...(attachments.length > 0 ? { attachments: mergeAttachments(now.attachments, attachments) } : {}),
  });
}

/** チャットを消したとき: 書きかけの文と送る前の添付を残さない */
export function forgetChatDraft(chatId: number) {
  writeSetting(storage.settings.draft(chatId), "");
  writeSetting(storage.settings.attachments(chatId), []);
}

/** 下書きの文を読み書きする（文は打つたびにすぐ残す） */
export function useDraftText(draft: ComposerDraft): readonly [string, (text: string) => void] {
  const text = useSyncExternalStore(draft.subscribe, () => draft.read().text);
  return [text, (next: string) => draft.write({ text: next })];
}
