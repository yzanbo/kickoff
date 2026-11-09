import { Check, ChevronRight } from "lucide-react";
import type { GitRefs, GitWorktree } from "@shared/types";
import type { Placement } from "@/lib/floating";
import { MenuFlyout, useSubmenu } from "@/ui/MenuFlyout";
import { MenuItem, PopupMenu } from "@/ui/PopupMenu";
import type { BranchActions } from "./useBranchActions";
import type { RefTarget } from "./refTarget";

const Separator = () => <div className="menu-separator" role="separator" />;

/**
 * 履歴の左の一覧・コミットの札の右クリックのメニュー。手元のブランチは
 * チェックアウト ｜ 早送り・プル・プッシュ・PR ｜ マージ・リベース ｜ 新しいブランチ・タグ ｜ 追跡・名前の変更・削除 ｜ 名前のコピー。
 * リモートのブランチ・タグは、それぞれに合う項目だけ。いまのブランチに意味のない項目は押せなくし、理由を乗せたときの説明に出す
 */
export function RefMenu({
  at,
  target,
  refs,
  actions,
  worktree,
  onClose,
}: {
  at: Placement;
  target: RefTarget;
  refs: GitRefs | undefined;
  actions: BranchActions;
  /** 左の一覧のワークツリーの行から開いたとき、そのワークツリーの操作（見る・Finder・VS Code・消す）も出す */
  worktree?: { tree: GitWorktree; viewing: boolean; onShow: () => void; onRemove: () => void };
  onClose: () => void;
}) {
  return (
    <PopupMenu at={at} label={`${target.name} のメニュー`} onClose={onClose}>
      {worktree && <WorktreeItems {...worktree} />}
      {target.kind === "branch" ? (
        <BranchItems name={target.name} refs={refs} actions={actions} />
      ) : target.kind === "remote" ? (
        <RemoteItems name={target.name} refs={refs} actions={actions} />
      ) : (
        <TagItems name={target.name} actions={actions} />
      )}
    </PopupMenu>
  );
}

/** ワークツリーの行の項目（メニューのいちばん上。見ている作業場所の切り替え・フォルダを開く・消す） */
function WorktreeItems({ tree, viewing, onShow, onRemove }: { tree: GitWorktree; viewing: boolean; onShow: () => void; onRemove: () => void }) {
  return (
    <>
      <div className="menu-label">ワークツリー</div>
      <MenuItem disabled={viewing || tree.prunable} title={viewing ? "いま見ている作業場所です" : tree.prunable ? "フォルダがなくなっています" : tree.path} onSelect={onShow}>
        この作業場所を見る
      </MenuItem>
      {window.kickoff && (
        <>
          <MenuItem onSelect={() => void window.kickoff?.externalApps.openPath(tree.path)}>Finder で開く</MenuItem>
          <MenuItem onSelect={() => void window.kickoff?.externalApps.openInVSCode(tree.path)}>VS Code で開く</MenuItem>
        </>
      )}
      <MenuItem danger onSelect={onRemove}>
        ワークツリーを消す…
      </MenuItem>
      <Separator />
      <div className="menu-label">ブランチ</div>
    </>
  );
}

/** マージ・リベースの 2 項目（いまのブランチへ取り込む。いまのブランチそのもの・ブランチから外れているときは押せない） */
function MergeItems({ name, actions, self }: { name: string; actions: BranchActions; self: boolean }) {
  const { current } = actions;
  const reason = !current ? "ブランチから外れています（ブランチをチェックアウトしてから）" : self ? "いまのブランチです" : undefined;
  return (
    <>
      <MenuItem disabled={Boolean(reason)} title={reason} onSelect={() => void actions.merge(name)}>
        {current ? `「${current}」に「${name}」をマージ…` : "マージ…"}
      </MenuItem>
      <MenuItem disabled={Boolean(reason)} title={reason} onSelect={() => void actions.rebase(name)}>
        {current ? `「${current}」を「${name}」の上にリベース…` : "リベース…"}
      </MenuItem>
    </>
  );
}

function BranchItems({ name, refs, actions }: { name: string; refs: GitRefs | undefined; actions: BranchActions }) {
  const branch = refs?.branches.find((b) => b.name === name);
  const tracking = useSubmenu();
  const isCurrent = Boolean(branch?.current);
  // ほかの作業場所（ワークツリー・本体）で取り出しているブランチは、ここではチェックアウト・削除できない
  const elsewhere = !isCurrent && branch?.worktree ? `「${branch.worktree}」で取り出しています` : undefined;
  const upstream = branch?.upstream ?? null;
  const remoteOfUpstream = upstream ? upstream.slice(0, upstream.indexOf("/")) : "origin";
  const noUpstream = upstream ? undefined : "追いかけているリモートのブランチがありません（「追跡」で選べます）";
  const cannotFf = noUpstream ?? (branch && branch.behind === 0 ? "遅れていません" : branch && branch.ahead > 0 ? "分かれているので早送りできません（プルでマージしてください）" : undefined);
  const remoteBranches = refs?.remotes.flatMap((r) => r.branches.map((b) => b.name)) ?? [];
  return (
    <>
      <MenuItem disabled={isCurrent || Boolean(elsewhere)} title={isCurrent ? "いまのブランチです" : elsewhere} onSelect={() => void actions.checkout(name)}>
        チェックアウト…
      </MenuItem>
      <MenuItem disabled={Boolean(branch?.worktree)} title={branch?.worktree ? `「${branch.worktree}」で取り出しています` : undefined} onSelect={() => void actions.checkoutAsWorktree(name)}>
        ワークツリーとしてチェックアウト…
      </MenuItem>
      <Separator />
      <MenuItem disabled={Boolean(cannotFf)} title={cannotFf} onSelect={() => void actions.fastForward(name)}>
        {upstream ? `「${upstream}」へ早送り` : "早送り"}
      </MenuItem>
      <MenuItem disabled={Boolean(noUpstream)} title={noUpstream ?? (isCurrent ? "取ってきて、分かれていればマージします" : "取ってきて、早送りだけします（作業場所は変えません）")} onSelect={() => void actions.pull(name)}>
        {upstream ? `「${upstream}」をプル` : "プル"}
      </MenuItem>
      <MenuItem onSelect={() => void actions.push(name)}>{`「${remoteOfUpstream}」へプッシュ…`}</MenuItem>
      <MenuItem onSelect={() => void actions.pushAndCreatePr(name)}>{`プッシュして「${remoteOfUpstream}」に PR を作る`}</MenuItem>
      <Separator />
      <MergeItems name={name} actions={actions} self={isCurrent} />
      <Separator />
      <MenuItem onSelect={() => void actions.createBranch(name)}>新しいブランチ…</MenuItem>
      <MenuItem onSelect={() => void actions.createTag(name)}>新しいタグ…</MenuItem>
      <Separator />
      <button {...tracking.trigger} disabled={remoteBranches.length === 0 && !upstream} title={remoteBranches.length === 0 && !upstream ? "リモートのブランチがありません" : undefined}>
        <span className="project-switch-item">追跡</span>
        <span className="menu-submenu-note">{upstream ?? "なし"}</span>
        <ChevronRight size={14} className="menu-submenu-chevron" aria-hidden />
      </button>
      {tracking.anchor && (
        <MenuFlyout anchor={tracking.anchor} label="追跡するリモートのブランチ" onBack={tracking.back}>
          {remoteBranches.map((remote) => (
            <MenuItem key={remote} role="menuitemradio" checked={remote === upstream} onSelect={() => remote !== upstream && void actions.setUpstream(name, remote)}>
              <span className="project-switch-item">{remote}</span>
              {remote === upstream && <Check size={14} aria-hidden />}
            </MenuItem>
          ))}
          {upstream && (
            <>
              <Separator />
              <MenuItem onSelect={() => void actions.setUpstream(name, null)}>追跡をやめる</MenuItem>
            </>
          )}
        </MenuFlyout>
      )}
      <MenuItem onSelect={() => void actions.rename(name)}>名前を変更…</MenuItem>
      <MenuItem danger disabled={isCurrent || Boolean(elsewhere)} title={isCurrent ? "いまのブランチは消せません（ほかのブランチをチェックアウトしてから）" : elsewhere} onSelect={() => void actions.deleteBranch(name)}>
        削除…
      </MenuItem>
      <Separator />
      <MenuItem onSelect={() => actions.copyName(name)}>ブランチ名をコピー</MenuItem>
    </>
  );
}

function RemoteItems({ name, refs, actions }: { name: string; refs: GitRefs | undefined; actions: BranchActions }) {
  const remote = refs?.remotes.find((r) => name.startsWith(`${r.name}/`))?.name ?? name.slice(0, name.indexOf("/"));
  return (
    <>
      <MenuItem onSelect={() => void actions.checkoutRemote(name, remote)}>チェックアウト…</MenuItem>
      <Separator />
      <MergeItems name={name} actions={actions} self={false} />
      <Separator />
      <MenuItem onSelect={() => void actions.createBranch(name)}>新しいブランチ…</MenuItem>
      <MenuItem onSelect={() => void actions.createTag(name)}>新しいタグ…</MenuItem>
      <Separator />
      <MenuItem danger onSelect={() => void actions.deleteRemoteBranch(name)}>
        リモートのブランチを削除…
      </MenuItem>
      <Separator />
      <MenuItem onSelect={() => actions.copyName(name)}>ブランチ名をコピー</MenuItem>
    </>
  );
}

function TagItems({ name, actions }: { name: string; actions: BranchActions }) {
  return (
    <>
      <MenuItem onSelect={() => void actions.checkoutDetached(name)}>チェックアウト（ブランチから外れる）…</MenuItem>
      <Separator />
      <MergeItems name={name} actions={actions} self={false} />
      <Separator />
      <MenuItem onSelect={() => void actions.createBranch(name)}>新しいブランチ…</MenuItem>
      <MenuItem onSelect={() => void actions.pushTag(name)}>「origin」へプッシュ…</MenuItem>
      <MenuItem danger onSelect={() => void actions.deleteTag(name)}>
        削除…
      </MenuItem>
      <Separator />
      <MenuItem onSelect={() => actions.copyName(name)}>タグ名をコピー</MenuItem>
    </>
  );
}
