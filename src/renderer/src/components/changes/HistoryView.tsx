import { ArrowDown, ArrowUp, Archive, Check, Cloud, GitBranch, History, Tag } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import type { GitCommit } from "../../../../core/types";
import { cx } from "../../cx";
import { startVerticalDrag } from "../../hooks/dragResize";
import { useStoredNumber } from "../../hooks/useStoredState";
import { Chevron } from "../Chevron";
import { ErrorText } from "../ErrorText";
import { RefreshButton } from "../IconButton";
import { SearchField } from "../SearchField";
import { CommitTable } from "./CommitTable";
import { CommitView } from "./CommitView";
import type { GitLogController } from "./useGitLog";

/** 上のコミットの表の高さ（割合。下はコミットの詳細） */
const SPLIT_KEY = "kickoff:history-split";
const DEFAULT_SPLIT = 45;

/** 左の一覧の 1 つのまとまり（ブランチ・リモートなど。見出しで開閉） */
function RefSection({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  const [open, setOpen] = useState(true);
  if (count === 0) return null;
  return (
    <section className="ref-section">
      <button className="change-group-head" aria-expanded={open} onClick={() => setOpen(!open)}>
        <Chevron open={open} />
        <span className="change-group-title">{title}</span>
      </button>
      {open && <ul className="ref-items">{children}</ul>}
    </section>
  );
}

/** 左の一覧の 1 行（押すとそのコミットを表で選ぶ） */
function RefItem({
  icon,
  name,
  note,
  active,
  onClick,
  depth = 0,
}: {
  icon: ReactNode;
  name: string;
  note?: ReactNode;
  active?: boolean;
  onClick: () => void;
  depth?: number;
}) {
  return (
    <li>
      <button className={cx("ref-item", active && "current")} style={{ paddingLeft: 22 + depth * 14 }} title={name} onClick={onClick}>
        {icon}
        <span className="ref-name">{name}</span>
        {note && <span className="ref-note">{note}</span>}
      </button>
    </li>
  );
}

/**
 * 履歴の左の一覧（Fork と同じ: すべてのコミット・ブランチ・リモート・タグ・stash）。名前で絞り込め、
 * 押すとそのコミットを表で選ぶ
 */
export function HistorySidebar({ log, onPick }: { log: GitLogController; onPick: (hash: string) => void }) {
  const [filter, setFilter] = useState("");
  const refs = log.refs;
  const match = (name: string) => name.toLowerCase().includes(filter.trim().toLowerCase());
  const current = refs?.branches.find((b) => b.current);
  const branches = refs?.branches.filter((b) => match(b.name)) ?? [];
  const remotes = refs?.remotes.map((r) => ({ ...r, branches: r.branches.filter((b) => match(b.name)) })).filter((r) => r.branches.length > 0) ?? [];
  const tags = refs?.tags.filter((t) => match(t.name)) ?? [];
  const stashes = refs?.stashes.filter((s) => match(s.message)) ?? [];

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
