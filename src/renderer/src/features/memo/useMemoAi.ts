import { useEffect, useRef, useState, type MutableRefObject } from "react";
import { api } from "@/api";
import { errorMessage } from "@shared/errors";
import type { MemoEditorHandle } from "./MarkdownEditor";

/** AI の案（どこを・何に直すか。part は選んだ部分か） */
export interface MemoAiProposal {
  from: number;
  to: number;
  original: string;
  text: string;
  part: boolean;
  instruction: string;
}

/** 定型の頼み（メモの見出しの「AI で直す」に並べる） */
export const MEMO_AI_PRESETS: readonly { label: string; instruction: string }[] = [
  { label: "整理する", instruction: "見出しと箇条書きで、読みやすく整理する（内容は変えない）" },
  { label: "要点だけに短く", instruction: "要点だけを残して短くまとめる" },
  { label: "誤字・表記を直す", instruction: "誤字・脱字・表記の揺れだけを直す（内容と構成は変えない）" },
  { label: "読みやすい文に", instruction: "意味を変えずに、読みやすい文に書き直す" },
];

/**
 * メモの AI の整理（MemoView の見出しの「AI で直す」）。本文で範囲を選んでいればその部分だけ、なければメモ全体を AI に渡し、
 * 答えは案（proposal）として持つだけで書き換えない。取り込む（accept）と、編集の部品の取引で範囲を置き換える（⌘Z で戻せる。保存はしないので未保存の書きかけになる）。
 * 案を作っている間に、その範囲を書き換えていたら取り込まない。別のメモへ移ったら案と頼みかけを捨てる
 */
export function useMemoAi(projectId: number, path: string, editor: MutableRefObject<MemoEditorHandle | null>) {
  const [busy, setBusy] = useState<string | null>(null);
  const [proposal, setProposal] = useState<MemoAiProposal | null>(null);
  const [error, setError] = useState<string | null>(null);
  // いちばん新しい頼みの番号（やめた・別のメモへ移ったあとに届いた答えは使わない）
  const request = useRef(0);

  useEffect(() => {
    request.current++;
    setBusy(null);
    setProposal(null);
    setError(null);
  }, [projectId, path]);

  /** いま AI に渡す範囲（選んでいればその部分、なければメモ全体） */
  const target = () => {
    const ed = editor.current;
    if (!ed) return null;
    const sel = ed.selection();
    if (sel) return { ...sel, part: true };
    const text = ed.text();
    return { from: 0, to: text.length, text, part: false };
  };

  const run = (instruction: string) => {
    const t = target();
    if (!t || !instruction.trim()) return;
    if (!t.text.trim()) return setError("直す文がありません");
    const id = ++request.current;
    setBusy(instruction);
    setError(null);
    setProposal(null);
    api.aiEditMemo(projectId, { text: t.text, instruction, part: t.part }).then(
      (r) => {
        if (id !== request.current) return;
        setBusy(null);
        if (r.text === t.text) return setError("AI の案は今と同じでした");
        setProposal({ from: t.from, to: t.to, original: t.text, text: r.text, part: t.part, instruction });
      },
      (e: unknown) => {
        if (id !== request.current) return;
        setBusy(null);
        setError(errorMessage(e));
      },
    );
  };

  return {
    busy,
    proposal,
    error,
    /** いま AI に渡す範囲（「AI で直す」を開いたときに、選んだ部分かメモ全体かを見せる） */
    target,
    run,
    /** 頼んでいるのをやめる（届いた答えは使わない） */
    cancel: () => {
      request.current++;
      setBusy(null);
    },
    accept: () => {
      if (!proposal) return;
      if (editor.current?.replace(proposal.from, proposal.to, proposal.original, proposal.text)) setProposal(null);
      else setError("案を作っている間にその部分が書き換わったため、取り込めません。もう一度頼んでください");
    },
    discard: () => setProposal(null),
    clearError: () => setError(null),
  };
}

export type MemoAi = ReturnType<typeof useMemoAi>;
