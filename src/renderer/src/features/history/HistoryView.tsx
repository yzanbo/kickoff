import { Archive, ArrowDown, ArrowUp, Check, Cloud, ExternalLink, FolderOpen, GitBranch, History, Plus, Tag, Trash2 } from "lucide-react";
import { useState, type MouseEvent } from "react";
import type { GitRefs, GitWorktree } from "@shared/types";
import { ErrorText } from "@/ui/ErrorText";
import { IconButton, RefreshButton } from "@/ui/IconButton";
import { SearchField } from "@/ui/SearchField";
import { RefItem, RefSection } from "./RefList";
import type { GitLogController } from "./useGitLog";
import type { RefTarget } from "./refTarget";
import { groupBranches } from "./refGroups";
import type { WorktreeActions } from "@/features/worktree/useWorktreeActions";

/** 追いかけているリモートとの進み・遅れ（どちらもなければ出さない） */
function SyncNote({ branch }: { branch?: GitRefs["branches"][number] }) {
  if (!branch || (branch.ahead === 0 && branch.behind === 0)) return null;
  return (
    <>
      {branch.ahead > 0 && (
        <>
          {branch.ahead}
          <ArrowUp size={11} aria-label="進んでいる" />
        </>
      )}
      {branch.behind > 0 && (
        <>
          {branch.behind}
          <ArrowDown size={11} aria-label="遅れている" />
        </>
      )}
    </>
  );
}

/** 作業場所のフォルダを Finder・VS Code で開くボタン（Mac のアプリだけ） */
function FolderButtons({ path }: { path: string }) {
  if (!window.kickoff) return null;
  return (
    <>
      <IconButton icon={FolderOpen} label="Finder で開く" size={14} onClick={() => void window.kickoff?.externalApps.openPath(path)} />
      <IconButton icon={ExternalLink} label="VS Code で開く" size={14} onClick={() => void window.kickoff?.externalApps.openInVSCode(path)} />
    </>
  );
}

/**
 * 履歴の左の一覧: すべてのコミット・本体・ワークツリー・リモート・タグ・退避（stash）。ブランチは取り出している作業場所で分ける
 * （本体 = 本体で取り出しているブランチと、どこにも取り出していないブランチ / ワークツリー = ワークツリーごとに取り出しているブランチ。`groupBranches`）。
 * 名前で絞り込め、押すとそのコミットを表で選ぶ。ブランチ・リモートのブランチ・タグの右クリックで、そのメニュー（onRefMenu。ワークツリーの行はワークツリーの項目も）、
 * 退避の右クリックで戻す・適用・削除（onStashMenu）。
 * busy は実行中のブランチの操作
 */
export function HistorySidebar({
  log,
  busy,
  worktreeActions,
  onPick,
  onRefMenu,
  onStashMenu,
}: {
  log: GitLogController;
  busy: string | null;
  worktreeActions: WorktreeActions;
  onPick: (hash: string) => void;
  onRefMenu: (e: MouseEvent, target: RefTarget) => void;
  /** 退避の行の右クリック（戻す・適用・削除。ref は "stash@{0}" の形） */
  onStashMenu: (e: MouseEvent, ref: string) => void;
}) {
  const [filter, setFilter] = useState("");
  const refs = log.refs;
  const match = (name: string) => name.toLowerCase().includes(filter.trim().toLowerCase());
  const current = refs?.branches.find((b) => b.current);
  const mainTree = log.worktrees?.find((w) => w.main);
  const groups = groupBranches(refs?.branches ?? [], log.worktrees ?? [], match);
  const remotes = refs?.remotes.map((r) => ({ ...r, branches: r.branches.filter((b) => match(b.name)) })).filter((r) => r.branches.length > 0) ?? [];
  const tags = refs?.tags.filter((t) => match(t.name)) ?? [];
  const stashes = refs?.stashes.filter((s) => match(s.message)) ?? [];
  const worktreeMenu = (e: MouseEvent, w: GitWorktree) => {
    if (w.branch) onRefMenu(e, { kind: "branch", name: w.branch, worktree: w.path });
    else e.preventDefault();
  };

  return (
    <>
      <header className="changes-head">
        <span className="changes-branch">履歴</span>
        {busy && <span className="muted small">{busy}中…</span>}
        <span className="spacer" />
        <RefreshButton label="履歴を取り直す" busy={false} onClick={log.refresh} />
      </header>
      <button className="ref-all" onClick={() => current && onPick(current.hash)}>
        <History size={15} aria-hidden /> すべてのコミット
      </button>
      <SearchField value={filter} onChange={setFilter} placeholder="絞り込む" label="ブランチ・タグを絞り込む" />
      <ErrorText message={log.error} className="code-search-message" />
      <RefSection title="本体" count={groups.main.length} action={mainTree && <FolderButtons path={mainTree.path} />}>
        {groups.main.map((b) => (
          <RefItem
            key={b.name}
            icon={b.current ? <Check size={14} aria-hidden /> : <GitBranch size={14} aria-hidden />}
            name={b.name}
            title={b.name === mainTree?.branch ? `${b.name}（本体で取り出しています）` : b.name}
            active={b.current}
            note={b.name === mainTree?.branch && !b.current ? "取り出し中" : <SyncNote branch={b} />}
            onClick={() => onPick(b.hash)}
            onContextMenu={(e) => onRefMenu(e, { kind: "branch", name: b.name })}
          />
        ))}
      </RefSection>
      <RefSection
        title="ワークツリー"
        count={groups.worktrees.length}
        always
        action={<IconButton icon={Plus} label="ワークツリーを作る" size={14} onClick={() => void worktreeActions.createWorktree()} />}
      >
        {groups.worktrees.map(({ worktree: w, branch }) => (
          <RefItem
            key={w.path}
            icon={branch?.current ? <Check size={14} aria-hidden /> : <GitBranch size={14} aria-hidden />}
            name={w.branch ?? "（ブランチなし）"}
            title={w.path}
            active={branch?.current}
            note={w.prunable ? "なくなっています" : <SyncNote branch={branch} />}
            onClick={() => onPick(w.head)}
            onContextMenu={(e) => worktreeMenu(e, w)}
            actions={
              <>
                <FolderButtons path={w.path} />
                <IconButton icon={Trash2} label="ワークツリーを消す" size={14} onClick={() => void worktreeActions.removeWorktree(w)} />
              </>
            }
          />
        ))}
      </RefSection>
      <ErrorText message={worktreeActions.error} className="code-search-message" />
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
                  onContextMenu={(e) => onRefMenu(e, { kind: "remote", name: b.name })}
                />
              ))}
            </ul>
          </li>
        ))}
      </RefSection>
      <RefSection title="タグ" count={tags.length}>
        {tags.map((t) => (
          <RefItem
            key={t.name}
            icon={<Tag size={14} aria-hidden />}
            name={t.name}
            onClick={() => onPick(t.hash)}
            onContextMenu={(e) => onRefMenu(e, { kind: "tag", name: t.name })}
          />
        ))}
      </RefSection>
      <RefSection title="退避（stash）" count={stashes.length}>
        {stashes.map((s) => (
          <RefItem key={s.ref} icon={<Archive size={14} aria-hidden />} name={s.message} onClick={() => onPick(s.hash)} onContextMenu={(e) => onStashMenu(e, s.ref)} />
        ))}
      </RefSection>
    </>
  );
}
