import { useEffect, useRef, useState, type MutableRefObject } from "react";
import { api } from "@/api";
import { errorMessage } from "@shared/errors";
import { useSetting } from "@/hooks/useSetting";
import { readSetting, writeSetting } from "@/lib/storage";
import { memoChat, type MemoChatEntry } from "@/lib/storageKeys";
import type { MemoEditorHandle } from "./MarkdownEditor";

/** 会話に残す件数（古いものから落とす） */
const MAX_ENTRIES = 100;

/** 定型の頼み（会話の欄の入力の上に並べる。押すとそのまま送る。メモに反映してもらうので「反映して」まで頼む） */
export const MEMO_CHAT_PRESETS: readonly { label: string; text: string }[] = [
  { label: "整理する", text: "見出しと箇条書きで読みやすく整理して、反映して（内容は変えない）" },
  { label: "要点だけに", text: "要点だけを残して短くまとめて、反映して" },
  { label: "誤字・表記を直す", text: "誤字・脱字・表記の揺れだけを直して、反映して（内容と構成は変えない）" },
  { label: "アイデアを出す", text: "この内容をふくらませるアイデアを、いくつか出して（まだ反映しないで）" },
];

/**
 * メモについての会話（本文の右の欄 MemoChat）。会話はメモごとに memoChat に残す（閉じても・アプリを閉じても続きから）。
 * 送るたびに、いまのメモ（まだ保存していない書きかけも）と選んでいる部分を添えて AI に聞く。返事に変更の案があれば、その発言に
 * 「どこを・何に」を持たせ、取り込む（apply）と編集の部品の取引で置き換える（⌘Z で戻せる。保存はしない）。案を作ったあとにその範囲が書き換わっていれば取り込まない。
 * 頼んでいる間に別のメモへ移った・やめたときに届いた返事は使わない
 */
export function useMemoChat(projectId: number, path: string, editor: MutableRefObject<MemoEditorHandle | null>) {
  const key = `${projectId}:${path}`;
  const [entries] = useSetting(memoChat(key));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const request = useRef(0);

  useEffect(() => {
    request.current++;
    setBusy(false);
    setError(null);
  }, [key]);

  /** いまの会話の後ろに足して残す（届くまでに足された分も消さないよう、覚えている値から足す） */
  const append = (entry: MemoChatEntry) => {
    const current = readSetting(memoChat(key));
    writeSetting(memoChat(key), [...current, entry].slice(-MAX_ENTRIES));
  };

  /** 話しかける（selection: 話の的にする選んだ部分。null なら選んでいてもメモ全体の話にする） */
  const send = (text: string, useSelection = true) => {
    const ed = editor.current;
    if (!ed || !text.trim() || busy) return;
    const sel = useSelection ? ed.selection() : null;
    const memo = ed.text();
    const user: MemoChatEntry = { role: "user", text: text.trim(), ...(sel ? { selection: sel.text } : {}) };
    const messages = [...readSetting(memoChat(key)), user].filter((e) => !e.error).map((e) => ({ role: e.role, text: e.text }));
    append(user);
    const id = ++request.current;
    setBusy(true);
    setError(null);
    api.memoChat(projectId, { messages, memo, selection: sel?.text ?? null }).then(
      (r) => {
        if (id !== request.current) return;
        setBusy(false);
        const range = r.edit && (r.edit.target === "selection" && sel ? { from: sel.from, to: sel.to, original: sel.text, part: true } : { from: 0, to: memo.length, original: memo, part: false });
        append({ role: "assistant", text: r.reply || (r.edit ? "メモの変更の案です。" : "（返事がありませんでした）"), ...(r.edit && range ? { edit: { ...range, text: r.edit.text } } : {}) });
      },
      (e: unknown) => {
        if (id !== request.current) return;
        setBusy(false);
        append({ role: "assistant", text: errorMessage(e), error: true });
      },
    );
  };

  /** index の発言の変更の案を取り込む */
  const apply = (index: number) => {
    const current = readSetting(memoChat(key));
    const edit = current[index]?.edit;
    if (!edit || edit.applied) return;
    if (!editor.current?.replace(edit.from, edit.to, edit.original, edit.text)) {
      setError("案を作ったあとにその部分が書き換わったため、取り込めません。もう一度頼んでください");
      return;
    }
    setError(null);
    writeSetting(
      memoChat(key),
      current.map((e, i) => (i === index && e.edit ? { ...e, edit: { ...e.edit, applied: true } } : e)),
    );
  };

  return {
    entries,
    busy,
    error,
    send,
    apply,
    /** 頼んでいるのをやめる（届いた返事は使わない） */
    cancel: () => {
      request.current++;
      setBusy(false);
    },
    clear: () => {
      request.current++;
      setBusy(false);
      setError(null);
      writeSetting(memoChat(key), []);
    },
    clearError: () => setError(null),
  };
}

export type MemoChatState = ReturnType<typeof useMemoChat>;
