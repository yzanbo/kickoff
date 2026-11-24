import { useEffect, useMemo, useState, type KeyboardEvent, type RefObject } from "react";
import type { SlashCommandOption } from "@shared/ai/types";
import type { GitTarget } from "@/foundation/ui/api/workdir";
import { stepIndex } from "@/foundation/ui/kit/list/useRovingList";
import { isComposing } from "@/foundation/ui/lib/keys";
import { createKeyedStore } from "@/foundation/ui/store/keyedStore";
import { workplaceFiles } from "@/foundation/ui/workplace/workplaceFiles";
import { useKeyedStore } from "@/foundation/ui/store/useStore";
import { findTrigger, isSuggestAcceptKey, matchCommands, matchFiles } from "./suggestMatch";
import { useFeatureBlock, providersApi } from "@/features/ai/ui";

export type SuggestItem =
  | { kind: "slash"; key: string; command: SlashCommandOption }
  | { kind: "file"; key: string; path: string };

/** 取り直すまでの間隔（ファイルは増えたり減ったりするので、しばらくしたら取り直す） */
const MAX_AGE_MS = 60_000;

/** 作業場所の key（プロジェクトの番号と、ワークツリーのフォルダ。本体は空）と、key からの作業場所 */
const keyOf = (target: GitTarget) => (typeof target === "number" ? `${target}\n` : `${target.projectId}\n${target.worktree ?? ""}`);
function targetOf(key: string): GitTarget {
  const [projectId, worktree] = key.split("\n");
  return { projectId: Number(projectId), worktree: worktree || undefined };
}

// 作業場所ごとの、コマンドとファイルの一覧（チャット欄がいくつあっても、取りに行くのは作業場所ごとに 1 回。しばらくしたら取り直す）
const commandsStore = createKeyedStore<string, SlashCommandOption[]>({ load: (key) => providersApi.slashCommands(targetOf(key)), maxAge: MAX_AGE_MS });
const filesStore = createKeyedStore<string, string[]>({ load: async (key) => (await workplaceFiles(targetOf(key))).files, maxAge: MAX_AGE_MS });

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

  const trigger = target ? findTrigger(text, caret) : null;
  const open = !paused && trigger !== null && dismissed !== trigger.start;
  const targetKey = target === undefined ? "" : keyOf(target);

  // 候補を出すときに、はじめて一覧を取ってくる（出している間は読み込みを頼む。取れなければ候補なし）
  // そのチャットの AI に / のコマンドがなければ取りに行かない（一覧はプロジェクトの AI のものなので、違う AI のチャットで出さない）
  const commandsBlocked = useFeatureBlock("commands") !== null;
  const commandsState = useKeyedStore(commandsStore, targetKey && trigger?.kind === "slash" && !commandsBlocked ? targetKey : undefined, { active: open });
  const filesState = useKeyedStore(filesStore, targetKey && trigger?.kind === "file" ? targetKey : undefined, { active: open });
  const commands = commandsState.data;
  const files = filesState.data;

  // 候補は打った種類と文だけで決める（trigger は打つたびに新しい物なので、中の値で作り直す）
  const triggerKind = trigger?.kind;
  const triggerQuery = trigger?.query;
  const items: SuggestItem[] = useMemo(() => {
    if (!open || triggerKind === undefined || triggerQuery === undefined) return [];
    if (triggerKind === "slash") return matchCommands(commands ?? [], triggerQuery).map((command) => ({ kind: "slash", key: command.name, command }));
    return matchFiles(files ?? [], triggerQuery).map((path) => ({ kind: "file", key: path, path }));
  }, [open, triggerKind, triggerQuery, commands, files]);
  const shown = trigger?.kind === "slash" ? commandsState : filesState;
  const loading = open && !shown.loaded && shown.error === undefined;

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
    if (!open || isComposing(e)) return false;
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
      setIndex((i) => stepIndex(i, step, items.length));
      return true;
    }
    if (isSuggestAcceptKey(e)) {
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
