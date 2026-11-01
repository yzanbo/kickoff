import { ArrowDown, ArrowUp, Archive, Check, Cloud, Code2, FolderGit2, FolderOpen, GitBranch, History, Plus, Tag, Trash2 } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import type { GitCommit, GitWorktree } from "../../../../core/types";
import { api } from "../../api";
import { cx } from "../../cx";
import { confirmDialog, promptDialog } from "../../dialogs";
import { errorMessage } from "../../errors";
import { useActionError } from "../../hooks/useActionError";
import { startVerticalDrag } from "../../hooks/dragResize";
import { useStoredNumber } from "../../hooks/useStoredState";
import { Chevron } from "../Chevron";
import { ErrorText } from "../ErrorText";
import { IconButton, RefreshButton } from "../IconButton";
import { SearchField } from "../SearchField";
import { CommitTable } from "./CommitTable";
import { CommitView } from "./CommitView";
import type { GitLogController } from "./useGitLog";

/** 上のコミットの表の高さ（割合。下はコミットの詳細） */
const SPLIT_KEY = "kickoff:history-split";
const DEFAULT_SPLIT = 45;

/** 左の一覧の 1 つのまとまり（ブランチ・リモートなど。見出しで開閉。action は見出しの右のボタン。always なら空でも出す） */
function RefSection({ title, count, action, always = false, children }: { title: string; count: number; action?: ReactNode; always?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(true);
  if (count === 0 && !always) return null;
  return (
    <section className="ref-section">
      <div className="change-group-row">
        <button className="change-group-head" aria-expanded={open} onClick={() => setOpen(!open)}>
          <Chevron open={open} />
          <span className="change-group-title">{title}</span>
        </button>
        {action}
      </div>
      {open && <ul className="ref-items">{children}</ul>}
    </section>
  );
}

/** 左の一覧の 1 行（押すとそのコミットを表で選ぶ。actions はマウスを乗せたときに出すボタン） */
function RefItem({
  icon,
  name,
  title,
  note,
  active,
  onClick,
  actions,
  depth = 0,
}: {
  icon: ReactNode;
  name: string;
  title?: string;
  note?: ReactNode;
  active?: boolean;
  onClick: () => void;
  actions?: ReactNode;
  depth?: number;
}) {
  return (
    <li className={actions ? "change-item" : undefined}>
      <button className={cx("ref-item", active && "current")} style={{ paddingLeft: 22 + depth * 14 }} title={title ?? name} onClick={onClick}>
        {icon}
        <span className="ref-name">{name}</span>
        {note && <span className="ref-note">{note}</span>}
      </button>
      {actions && <span className="row-actions">{actions}</span>}
    </li>
  );
}

/**
 * 履歴の左の一覧（Fork と同じ: すべてのコミット・ブランチ・リモート・タグ・stash）。名前で絞り込め、
 * 押すとそのコミットを表で選ぶ
 */
export function HistorySidebar({ projectId, log, onPick }: { projectId: number; log: GitLogController; onPick: (hash: string) => void }) {
  const [filter, setFilter] = useState("");
  const worktreeError = useActionError();
  const repoName = log.worktrees?.[0]?.path.split("/").pop() ?? "";

  // ワークツリーを作る（ブランチの名前を聞く。なければいまのコミットから作る）
  const createWorktree = async () => {
    const branch = await promptDialog({
      title: "ワークツリーを作る",
      message: `いまのコミットから新しいブランチを作り、リポジトリの隣の「${repoName}-worktrees」フォルダに取り出します。いまあるブランチの名前なら、そのブランチを取り出します。`,
      label: "ブランチの名前",
      placeholder: "例: feature/login",
      confirmLabel: "作る",
    });
    if (!branch) return;
    await worktreeError.guard(async () => {
      log.setWorktrees(await api.addWorktree(projectId, branch));
      log.refresh();
    });
  };

  // ワークツリーを消す（フォルダを消す。ブランチは残す。変更が残っていれば、もう一度確かめる）
  const removeWorktree = async (w: GitWorktree) => {
    const name = w.branch ?? w.path.split("/").pop();
    if (!(await confirmDialog({ title: `ワークツリー「${name}」を消しますか？`, message: `${w.path} のフォルダを消します。ブランチは残ります。`, confirmLabel: "消す", danger: true }))) return;
    try {
      log.setWorktrees(await api.removeWorktree(projectId, w.path));
      worktreeError.setError(undefined);
    } catch (e) {
      if (!errorMessage(e).includes("--force")) return worktreeError.setError(errorMessage(e));
      const force = await confirmDialog({
        title: "コミットしていない変更があります",
        message: "消すと、そのワークツリーの変更はなくなります。それでも消しますか？",
        confirmLabel: "変更ごと消す",
        danger: true,
      });
      if (force) await worktreeError.guard(async () => log.setWorktrees(await api.removeWorktree(projectId, w.path, true)));
    }
  };
  const refs = log.refs;
  const match = (name: string) => name.toLowerCase().includes(filter.trim().toLowerCase());
  const current = refs?.branches.find((b) => b.current);
  const branches = refs?.branches.filter((b) => match(b.name)) ?? [];
  const remotes = refs?.remotes.map((r) => ({ ...r, branches: r.branches.filter((b) => match(b.name)) })).filter((r) => r.branches.length > 0) ?? [];
  const tags = refs?.tags.filter((t) => match(t.name)) ?? [];
  const stashes = refs?.stashes.filter((s) => match(s.message)) ?? [];
  const worktrees = log.worktrees?.filter((w) => match(w.branch ?? w.path)) ?? [];

  return (
    <>
      <header className="changes-head">
        <span className="changes-branch">履歴</span>
        <span className="spacer" />
        <RefreshButton label="履歴を取り直す" busy={false} onClick={log.refresh} />
      </header>
      <button className="ref-all" onClick={() => current && onPick(current.hash)}>
        <History size={15} aria-hidden /> すべてのコミット
      </button>
      <SearchField value={filter} onChange={setFilter} placeholder="絞り込む" label="ブランチ・タグを絞り込む" />
      <ErrorText message={log.error} className="code-search-message" />
      <RefSection title="ブランチ" count={branches.length}>
        {branches.map((b) => (
          <RefItem
            key={b.name}
            icon={b.current ? <Check size={14} aria-hidden /> : <GitBranch size={14} aria-hidden />}
            name={b.name}
            active={b.current}
            note={
              (b.ahead > 0 || b.behind > 0) && (
                <>
                  {b.ahead > 0 && (
                    <>
                      {b.ahead}
                      <ArrowUp size={11} aria-label="進んでいる" />
                    </>
                  )}
                  {b.behind > 0 && (
                    <>
                      {b.behind}
                      <ArrowDown size={11} aria-label="遅れている" />
                    </>
                  )}
                </>
              )
            }
            onClick={() => onPick(b.hash)}
          />
        ))}
      </RefSection>
      <RefSection title="リモート" count={remotes.length}>
        {remotes.map((r) => (
          <li key={r.name}>
            <span className="ref-remote-name">
              <Cloud size={14} aria-hidden /> {r.name}
            </span>
            <ul className="ref-items">
              {r.branches.map((b) => (
                <RefItem
                  key={b.name}
                  icon={<GitBranch size={14} aria-hidden />}
                  name={b.name.slice(r.name.length + 1)}
                  depth={1}
                  onClick={() => onPick(b.hash)}
                />
              ))}
            </ul>
          </li>
        ))}
      </RefSection>
      <RefSection
        title="ワークツリー"
        count={worktrees.length}
        always
        action={<IconButton icon={Plus} label="ワークツリーを作る" size={14} onClick={() => void createWorktree()} />}
      >
        {worktrees.map((w) => (
          <RefItem
            key={w.path}
            icon={<FolderGit2 size={14} aria-hidden />}
            name={w.branch ?? "（ブランチなし）"}
            title={w.path}
            note={w.main ? "本体" : w.prunable ? "なくなっています" : undefined}
            onClick={() => onPick(w.head)}
            actions={
              <>
                {window.kickoff && <IconButton icon={FolderOpen} label="Finder で開く" size={14} onClick={() => void window.kickoff?.openPath(w.path)} />}
                {window.kickoff && <IconButton icon={Code2} label="VS Code で開く" size={14} onClick={() => void window.kickoff?.openInVSCode(w.path)} />}
                {!w.main && <IconButton icon={Trash2} label="ワークツリーを消す" size={14} onClick={() => void removeWorktree(w)} />}
              </>
            }
          />
        ))}
      </RefSection>
      <ErrorText message={worktreeError.error} className="code-search-message" />
      <RefSection title="タグ" count={tags.length}>
        {tags.map((t) => (
          <RefItem key={t.name} icon={<Tag size={14} aria-hidden />} name={t.name} onClick={() => onPick(t.hash)} />
        ))}
      </RefSection>
      <RefSection title="stash" count={stashes.length}>
        {stashes.map((s) => (
          <RefItem key={s.ref} icon={<Archive size={14} aria-hidden />} name={s.message} onClick={() => onPick(s.hash)} />
        ))}
      </RefSection>
    </>
  );
}

/** 履歴の右側（Fork と同じ: 上にコミットの表、下に選んだコミットの詳細。境目はドラッグで動かせる） */
export function HistoryMain({
  projectId,
  log,
  commit,
  onSelect,
}: {
  projectId: number;
  log: GitLogController;
  commit?: GitCommit;
  onSelect: (commit: GitCommit) => void;
}) {
  const [split, setSplit] = useStoredNumber(SPLIT_KEY, DEFAULT_SPLIT);
  const [resizing, setResizing] = useState(false);
  const mainRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLDivElement>(null);

  const startResize = (e: React.PointerEvent<HTMLDivElement>) => {
    const main = mainRef.current;
    const table = tableRef.current;
    if (!main || !table) return;
    const box = main.getBoundingClientRect();
    let next = split;
    setResizing(true);
    startVerticalDrag(e, {
      // ドラッグ中は描き直さず、高さだけを書き換えて指に追従させる
      move: (clientY) => {
        next = Math.round(Math.max(15, Math.min(85, ((clientY - box.top) / box.height) * 100)));
        table.style.flexBasis = `${next}%`;
      },
      end: () => {
        setResizing(false);
        setSplit(next);
      },
    });
  };

  return (
    <div ref={mainRef} className={cx("history-main", resizing && "resizing")}>
      <div ref={tableRef} className="history-table" style={{ flexBasis: `${split}%` }}>
        <CommitTable log={log} selected={commit?.hash} onSelect={onSelect} />
      </div>
      <div
        className="history-resizer"
        role="separator"
        aria-orientation="horizontal"
        aria-label="コミットの表の高さを変える"
        title="ドラッグで高さを変える（ダブルクリックで元に戻す）"
        onPointerDown={startResize}
        onDoubleClick={() => setSplit(DEFAULT_SPLIT)}
      />
      <div className="history-detail">
        {commit ? (
          <CommitView projectId={projectId} commit={commit} />
        ) : (
          <p className="muted small changes-hint">コミットを選ぶと、変わったファイルと差分を表示します。</p>
        )}
      </div>
    </div>
  );
}
