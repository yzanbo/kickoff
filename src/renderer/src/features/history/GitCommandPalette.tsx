import { Search } from "lucide-react";
import { useEffect, useRef, useState, type RefObject } from "react";
import { cx } from "@/lib/cx";
import { useListNavigation } from "@/hooks/useListNavigation";
import { Popover } from "@/ui/Popover";
import type { HistoryOps } from "./useHistoryOps";

/** 窓に並べる操作 1 つ（blocked があれば押せず、理由を添える） */
interface GitCommand {
  id: string;
  label: string;
  /** 右に薄く添える説明 */
  hint?: string;
  blocked?: string | null;
  run: () => unknown;
}

/** いまの状態で選べる Git の操作の一覧（帯のボタンと同じ操作・ほかのブランチのチェックアウト / マージ / リベース・外で開く） */
function gitCommands(ops: HistoryOps): GitCommand[] {
  const current = ops.current;
  const others = ops.branches.filter((b) => !b.current);
  return [
    { id: "fetch", label: "フェッチ", hint: "リモートの情報を取ってくる", run: ops.fetch },
    { id: "pull", label: "プル", hint: ops.upstream ?? undefined, blocked: ops.pullBlocked, run: ops.pull },
    { id: "push", label: "プッシュ", hint: ops.upstream ?? "origin", blocked: ops.pushBlocked, run: ops.push },
    { id: "stash", label: "変更を退避…", run: ops.stashSave },
    { id: "stash-pop", label: "最新の退避を戻す", blocked: ops.hasStash ? null : "退避はありません", run: ops.stashPopLatest },
    { id: "stash-apply", label: "最新の退避を適用", blocked: ops.hasStash ? null : "退避はありません", run: ops.stashApplyLatest },
    { id: "branch", label: "新しいブランチ…", hint: current ?? "いまのコミット", run: ops.newBranch },
    { id: "tag", label: "新しいタグ…", hint: current ?? "いまのコミット", run: ops.newTag },
    { id: "worktree", label: "ワークツリーを作る…", run: ops.newWorktree },
    ...others.map((b) => ({
      id: `checkout:${b.name}`,
      label: `チェックアウト: ${b.name}`,
      blocked: b.worktree ? "ほかの作業場所で取り出しています" : null,
      run: () => ops.checkout(b.name),
    })),
    ...others.map((b) => ({
      id: `merge:${b.name}`,
      label: `マージ: ${b.name}`,
      hint: current ? `「${current}」に取り込む` : undefined,
      blocked: current ? null : "ブランチから外れています",
      run: () => ops.merge(b.name),
    })),
    ...others.map((b) => ({
      id: `rebase:${b.name}`,
      label: `リベース: ${b.name}`,
      hint: current ? `「${current}」をこの上に載せる` : undefined,
      blocked: current ? null : "ブランチから外れています",
      run: () => ops.rebase(b.name),
    })),
    ...(ops.canOpenOutside
      ? [
          { id: "finder", label: "Finder で開く", run: ops.openFinder },
          { id: "vscode", label: "VS Code で開く", run: ops.openVSCode },
          { id: "terminal", label: `${ops.terminalLabel} で開く`, run: ops.openTerminal },
        ]
      : []),
    { id: "list", label: ops.listHidden ? "左の一覧を開く" : "左の一覧を閉じる", run: ops.toggleList },
  ];
}

/**
 * Git の操作の窓（履歴の上の帯の「操作」）。名前の一部を打って絞り込み、↑↓ で選んで Enter（押しても）で実行する。
 * 選ぶと窓を閉じてから実行する（確かめのダイアログが窓の上に重ならないように）
 */
export function GitCommandPalette({ anchor, ops, onClose }: { anchor: RefObject<HTMLElement | null>; ops: HistoryOps; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const commands = gitCommands(ops).filter((c) => words.every((w) => `${c.label} ${c.hint ?? ""}`.toLowerCase().includes(w)));
  const pick = (c: GitCommand | undefined) => {
    if (!c || c.blocked) return;
    onClose();
    void c.run();
  };
  const nav = useListNavigation(commands, pick);
  const { setIndex } = nav;
  // 絞り込みを変えたら、いちばん上を選び直す
  useEffect(() => setIndex(0), [query, setIndex]);
  useEffect(() => inputRef.current?.focus(), []);

  return (
    <Popover anchor={anchor} label="Git の操作" className="git-palette" onClose={onClose}>
      <label className="git-palette-search">
        <Search size={14} aria-hidden />
        <input
          ref={inputRef}
          type="text"
          value={query}
          placeholder="操作を探す（例: プッシュ・チェックアウト）"
          aria-label="Git の操作を探す"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={nav.onKeyDown}
        />
      </label>
      <ul className="git-palette-list" role="listbox" aria-label="Git の操作">
        {commands.map((c, i) => (
          <li key={c.id} role="option" aria-selected={i === nav.index} aria-disabled={c.blocked ? true : undefined}>
            <button
              type="button"
              className={cx("git-palette-item", i === nav.index && "active")}
              data-tip={c.blocked ?? undefined}
              onMouseEnter={() => setIndex(i)}
              onClick={() => pick(c)}
            >
              <span className="git-palette-label">{c.label}</span>
              {c.hint && <span className="git-palette-hint">{c.hint}</span>}
            </button>
          </li>
        ))}
        {commands.length === 0 && <li className="git-palette-empty">合う操作はありません</li>}
      </ul>
    </Popover>
  );
}
