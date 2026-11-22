// 描いている入力欄の登録簿（下書きの残す先ごと）。外から入力欄にピントを移すのはここから（DOM のクラス名で探さない）
import { createContext, useContext, useEffect, type RefObject } from "react";
import { screenOfChat } from "@/features/chat/ui";
import { chatComposerDraft, type ComposerDraft } from "./composerDraft";

type FieldRef = RefObject<HTMLTextAreaElement | null>;

const fields = new Map<string, Set<FieldRef>>();

/** 入力欄を描いている間だけ、その下書きの残す先に載せる（Composer が呼ぶ） */
export function useComposerField(draftId: string, ref: FieldRef) {
  useEffect(() => {
    let list = fields.get(draftId);
    if (!list) fields.set(draftId, (list = new Set()));
    list.add(ref);
    return () => {
      list.delete(ref);
      if (list.size === 0) fields.delete(draftId);
    };
  }, [draftId, ref]);
}

export interface FocusOptions {
  /** キャレットを文の終わりに置く（外から文を入れたあと） */
  end?: boolean;
  /** この要素の中の入力欄だけ（チャットの画面の中の欄） */
  within?: Element | null;
}

/** その下書きの入力欄にピントを移す（描き直して文が入ってから。見えている欄を先に） */
export function focusDraft(draft: ComposerDraft, { end = false, within }: FocusOptions = {}) {
  requestAnimationFrame(() => {
    const els = [...(fields.get(draft.id) ?? [])].flatMap((r) => (r.current?.isConnected && (!within || within.contains(r.current)) ? [r.current] : []));
    const el = els.find((e) => e.offsetParent !== null) ?? els[0];
    if (!el) return;
    el.focus();
    if (end) el.setSelectionRange(el.value.length, el.value.length);
  });
}

/** そのチャットの画面の入力欄にピントを移す（画面がこのウィンドウになければ何もしない） */
export function focusComposer(chatId: number, opts: Omit<FocusOptions, "within"> = {}) {
  const screen = screenOfChat(chatId);
  if (screen) focusDraft(chatComposerDraft(chatId), { ...opts, within: screen.root.current });
}

/** 入力欄の枠の中の上に置いたもの（定型文の帯）から、文をキャレットの位置に入れる口（Composer が配る。入力欄の外では null） */
const InsertContext = createContext<((text: string) => void) | null>(null);
export const ComposerInsertProvider = InsertContext.Provider;
export const useComposerInsert = (): ((text: string) => void) | null => useContext(InsertContext);
