// 送る前の新しいチャット（下書き）の店。書きかけの文・添付・名前・固定・作成先・seed を持ち、localStorage に残す（再起動しても残る・ほかのウィンドウとも同じ値）。
// チャットのパネルのタブ（kind: "new"）は同じキーで下書きを指すだけ。どの欄で開いているかと開く操作は chatPanel の drafts/panelDrafts.ts
import { useSyncExternalStore } from "react";
import { readSetting, subscribeSetting, writeSetting } from "@/foundation/ui/storage";
import { NEW_CHAT_TITLE, type NewChatSeed } from "@/features/chat/ui";
import type { ComposerDraft } from "./composerDraft";
import { storage } from "./storage";
import { NO_ATTACHMENTS, type NewChatDraft } from "./storedDrafts";

export type { NewChatDraft };

/** 作成先（どのプロジェクト・グループ・作業場所で始めるか） */
export type NewChatDraftTarget = Pick<NewChatDraft, "projectId" | "group" | "worktree">;

const setting = storage.settings.newChatDrafts;

export const readNewChatDrafts = (): readonly NewChatDraft[] => readSetting(setting);
export const subscribeNewChatDrafts = (listener: () => void): (() => void) => subscribeSetting(setting, listener);

/** 下書き（なければ undefined） */
export const newChatDraft = (key: string): NewChatDraft | undefined => readNewChatDrafts().find((d) => d.key === key);

/** すべての下書き（変わったら描き直す。変わるまでは同じ配列） */
export function useNewChatDrafts(): readonly NewChatDraft[] {
  return useSyncExternalStore(subscribeNewChatDrafts, readNewChatDrafts);
}

/** 1 つの下書き（変わったら描き直す） */
export function useNewChatDraft(key: string): NewChatDraft | undefined {
  return useSyncExternalStore(subscribeNewChatDrafts, () => newChatDraft(key));
}

/**
 * 下書きを作る（同じキーがもうあればそのまま）。seed は初めに入力欄に入れるもの（送信待ちの指示・選んだ文。文と添付を下書きに入れる）。
 * fields は初めから入れる中身（別のプロジェクトへ移すときの書きかけ・添付・名前・固定）
 */
export function createNewChatDraft(key: string, target: NewChatDraftTarget, seed?: NewChatSeed, fields: Partial<Omit<NewChatDraft, "key" | "projectId">> = {}): NewChatDraft {
  const known = newChatDraft(key);
  if (known) return known;
  const draft: NewChatDraft = { key, ...target, text: seed?.text ?? "", ...(seed ? { seed, attachments: seed.attachments } : {}), ...fields };
  writeSetting(setting, [...readNewChatDrafts(), draft]);
  return draft;
}

/** 下書きの中身を変える（undefined の項目は外す。ない下書き・変わらないときは何もしない） */
export function patchNewChatDraft(key: string, patch: Partial<Omit<NewChatDraft, "key" | "projectId">>): void {
  const all = readNewChatDrafts();
  const at = all.findIndex((d) => d.key === key);
  if (at < 0) return;
  const now = all[at];
  if (Object.entries(patch).every(([k, v]) => now[k as keyof NewChatDraft] === v)) return;
  const next = { ...now, ...patch };
  for (const k of Object.keys(patch) as (keyof NewChatDraft)[]) if (next[k] === undefined) delete next[k];
  writeSetting(setting, all.map((d, i) => (i === at ? next : d)));
}

/** 下書きを消す（送った・閉じた・プロジェクトを消した） */
export function discardNewChatDraft(key: string): void {
  const all = readNewChatDrafts();
  if (all.some((d) => d.key === key)) writeSetting(setting, all.filter((d) => d.key !== key));
}

/** 下書きの表示名（手動の名前、本文の空でない最初の行、New Chat の順。タブ・サイドバー・ボード・⌘⇧A で同じ） */
export function draftTitleOf(draft: Pick<NewChatDraft, "title" | "text"> | undefined): string {
  return draft?.title || draft?.text.split(/\r\n|\r|\n/).map((line) => line.trim()).find(Boolean) || NEW_CHAT_TITLE;
}

/** 作った入力欄の下書き（同じ下書きには同じものを返す。描くたびに作り直すと購読し直しになる） */
const composerDrafts = new Map<string, ComposerDraft>();

/** 新しいチャットの入力欄の下書き（文と添付をこの店に読み書きする。打つたびにすぐ残す） */
export function newChatComposerDraft(key: string): ComposerDraft {
  const known = composerDrafts.get(key);
  if (known) return known;
  const draft: ComposerDraft = {
    id: `newChat:${key}`,
    read: () => {
      const d = newChatDraft(key);
      return { text: d?.text ?? "", attachments: d?.attachments ?? NO_ATTACHMENTS };
    },
    write: (next) =>
      patchNewChatDraft(key, {
        ...(next.text !== undefined ? { text: next.text } : {}),
        ...(next.attachments !== undefined ? { attachments: [...next.attachments] } : {}),
      }),
    subscribe: subscribeNewChatDrafts,
  };
  composerDrafts.set(key, draft);
  return draft;
}
