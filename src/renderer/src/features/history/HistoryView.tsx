import { ArrowDown, ArrowUp, Archive, Check, Cloud, Code2, FolderGit2, FolderOpen, GitBranch, History, Plus, Tag, Trash2 } from "lucide-react";
import { useState } from "react";
import { ErrorText } from "@/ui/ErrorText";
import { IconButton, RefreshButton } from "@/ui/IconButton";
import { SearchField } from "@/ui/SearchField";
import { RefItem, RefSection } from "./RefList";
import type { GitLogController } from "./useGitLog";
import { useWorktreeActions } from "@/features/worktree/useWorktreeActions";

/**
 * 履歴の左の一覧（Fork と同じ: すべてのコミット・ブランチ・リモート・タグ・stash）。名前で絞り込め、
 * 押すとそのコミットを表で選ぶ
 */
export function HistorySidebar({ projectId, log, onPick }: { projectId: number; log: GitLogController; onPick: (hash: string) => void }) {
  const [filter, setFilter] = useState("");
  const worktreeActions = useWorktreeActions(projectId, log);
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
        action={<IconButton icon={Plus} label="ワークツリーを作る" size={14} onClick={() => void worktreeActions.createWorktree()} />}
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
                {window.kickoff && <IconButton icon={FolderOpen} label="Finder で開く" size={14} onClick={() => void window.kickoff?.externalApps.openPath(w.path)} />}
                {window.kickoff && <IconButton icon={Code2} label="VS Code で開く" size={14} onClick={() => void window.kickoff?.externalApps.openInVSCode(w.path)} />}
                {!w.main && <IconButton icon={Trash2} label="ワークツリーを消す" size={14} onClick={() => void worktreeActions.removeWorktree(w)} />}
              </>
            }
          />
        ))}
      </RefSection>
      <ErrorText message={worktreeActions.error} className="code-search-message" />
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
