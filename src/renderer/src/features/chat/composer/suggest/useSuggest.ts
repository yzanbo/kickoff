import { useEffect, useMemo, useState, type KeyboardEvent, type RefObject } from "react";
import type { SlashCommandOption } from "@shared/types";
import { api, type GitTarget } from "@/api";
import { findTrigger, matchCommands, matchFiles } from "./suggestMatch";

export type SuggestItem =
  | { kind: "slash"; key: string; command: SlashCommandOption }
  | { kind: "file"; key: string; path: string };

/** 取り直すまでの間隔（ファイルは増えたり減ったりするので、しばらくしたら取り直す） */
const MAX_AGE_MS = 60_000;

const keyOf = (target: GitTarget) => (typeof target === "number" ? `${target}` : `${target.projectId}:${target.worktree ?? ""}`);

// 作業場所ごとの、コマンドとファイルの一覧（チャット欄がいくつあっても、取りに行くのは作業場所ごとに 1 回）
const cache = new Map<string, { at: number; promise: Promise<unknown> }>();
function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < MAX_AGE_MS) return hit.promise as Promise<T>;
  const promise = load().catch(() => {
    cache.delete(key);
    return [] as unknown as T;
  });
  cache.set(key, { at: Date.now(), promise });
  return promise;
}

/**
 * チャット欄の / と @ の候補（Claude Code の VS Code 拡張と同じ）。
 * / は文の先頭で打ったとき、作業場所で使えるコマンド（スキルを含む）を出す。@ はどこでも、作業場所のファイルを出す。
 * ↑↓ で選び、Enter か Tab で入れる。Esc で閉じる。target がなければ出さない（paused の間も出さない）
 */
export function useSuggest({
  target,
  text,
  setText,
  textareaRef,
  paused = false,
}: {
  target: GitTarget | undefined;
  text: string;
  setText: (text: string) => void;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  /** 候補を出さない間（↑ で呼び出した前の発言を出している間。候補に ↑↓ を取られないように） */
  paused?: boolean;
}) {
  const [caret, setCaret] = useState(text.length);
  const [index, setIndex] = useState(0);
  // Esc で閉じた候補（同じ場所で打ち続けている間は出さない）
  const [dismissed, setDismissed] = useState<number | null>(null);
  const [commands, setCommands] = useState<SlashCommandOption[]>();
  const [files, setFiles] = useState<string[]>();

  const trigger = target ? findTrigger(text, caret) : null;
  const open = !paused && trigger !== null && dismissed !== trigger.start;
  const targetKey = target === undefined ? "" : keyOf(target);

  // 候補を出すときに、はじめて一覧を取ってくる
  useEffect(() => {
    if (!open || !target) return;
    let alive = true;
    if (trigger.kind === "slash") {
      void cached(`commands:${targetKey}`, () => api.slashCommands(target)).then((list) => alive && setCommands(list));
    } else {
      void cached(`files:${targetKey}`, () => api.projectFiles(target).then((r) => r.files)).then((list) => alive && setFiles(list));
    }
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, trigger?.kind, targetKey]);

  const items: SuggestItem[] = useMemo(() => {
    if (!open || !trigger) return [];
    if (trigger.kind === "slash") return matchCommands(commands ?? [], trigger.query).map((command) => ({ kind: "slash", key: command.name, command }));
    return matchFiles(files ?? [], trigger.query).map((path) => ({ kind: "file", key: path, path }));
  }, [open, trigger?.kind, trigger?.query, commands, files]); // eslint-disable-line react-hooks/exhaustive-deps
  const loading = open && (trigger?.kind === "slash" ? commands === undefined : files === undefined);

  // 打つたびに、先頭の候補を選び直す
  useEffect(() => setIndex(0), [trigger?.kind, trigger?.query]);
  // 別の場所で打ち始めたら、閉じた候補をまた出す
  useEffect(() => {
    if (dismissed !== null && trigger?.start !== dismissed) setDismissed(null);
  }, [trigger?.start, dismissed]);

  /** 候補を入れる（/ や @ から打った分を置き換え、後ろに空白を足す） */
  const accept = (item: SuggestItem) => {
    if (!trigger) return;
    const insert = item.kind === "slash" ? `/${item.command.name} ` : `@${item.path} `;
    const next = text.slice(0, trigger.start) + insert + text.slice(caret);
    const pos = trigger.start + insert.length;
    setText(next);
    setCaret(pos);
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      el?.focus();
      el?.setSelectionRange(pos, pos);
    });
  };

  /** 候補を出している間のキー操作。扱ったら true（送信などはしない） */
  const handleKey = (e: KeyboardEvent<HTMLTextAreaElement>): boolean => {
    if (!open || e.nativeEvent.isComposing || e.keyCode === 229) return false;
    if (e.key === "Escape") {
      // パネルを閉じる Esc に渡さない
      e.preventDefault();
      e.stopPropagation();
      setDismissed(trigger.start);
      return true;
    }
    if (items.length === 0) return false;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const step = e.key === "ArrowDown" ? 1 : -1;
      setIndex((i) => (i + step + items.length) % items.length);
      return true;
    }
    if ((e.key === "Enter" && !e.shiftKey) || e.key === "Tab") {
      e.preventDefault();
      accept(items[Math.min(index, items.length - 1)]);
      return true;
    }
    return false;
  };

  return {
    open,
    kind: trigger?.kind,
    query: trigger?.query ?? "",
    items,
    index,
    loading,
    setIndex,
    accept,
    handleKey,
    /** テキスト欄のカーソルが動いたとき */
    onCaret: (pos: number) => setCaret(pos),
  };
}

export type SuggestController = ReturnType<typeof useSuggest>;
