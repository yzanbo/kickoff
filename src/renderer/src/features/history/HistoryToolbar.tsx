import {
  Archive,
  ArrowDownToLine,
  ArrowUpFromLine,
  ChevronDown,
  CloudDownload,
  GitBranch,
  GitBranchPlus,
  PanelLeftClose,
  PanelLeftOpen,
  Share,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { MouseEvent, ReactNode, Ref } from "react";
import { cx } from "@/lib/cx";
import { usePopover } from "@/ui/Popover";
import { MenuItem, PopupMenu } from "@/ui/PopupMenu";
import { useContextMenu } from "@/ui/useContextMenu";
import { GitCommandPalette } from "./GitCommandPalette";
import type { HistoryOps } from "./useHistoryOps";

const Separator = () => <div className="menu-separator" role="separator" />;

/** 帯のボタン（上にアイコン・下に名前。数があれば右上に。押せないときは理由を乗せたときの説明に出す） */
function ToolButton({
  icon: Icon,
  label,
  tip,
  badge,
  blocked,
  busy,
  buttonRef,
  className,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  tip: string;
  badge?: number;
  /** 押せない理由（あれば押せない） */
  blocked?: string | null;
  busy?: boolean;
  buttonRef?: Ref<HTMLButtonElement>;
  className?: string;
  onClick: (e: MouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      ref={buttonRef}
      type="button"
      className={cx("history-tool", busy && "busy", className)}
      aria-disabled={blocked ? true : undefined}
      aria-label={label}
      data-tip={blocked ?? tip}
      onClick={(e) => !blocked && !busy && onClick(e)}
    >
      <span className="history-tool-icon">
        <Icon size={18} aria-hidden />
        {badge ? <span className="history-tool-badge">{badge}</span> : null}
      </span>
      <span className="history-tool-label">{label}</span>
    </button>
  );
}

/** ボタンの右の ▾（そのボタンのほかの操作のメニュー） */
function Caret({ label, onClick }: { label: string; onClick: (e: MouseEvent<HTMLButtonElement>) => void }) {
  return (
    <button type="button" className="history-tool-caret" aria-label={label} data-tip={label} onClick={onClick}>
      <ChevronDown size={12} aria-hidden />
    </button>
  );
}

type MenuKind = "stash" | "branch" | "switch" | "open";

/**
 * 履歴タブの上の帯（利用者の依頼で、よく使う Git の操作を名前つきのボタンで並べた）: 一覧の開閉・Git の操作の窓 ｜ フェッチ・プル（遅れの数）・プッシュ（進みの数）・退避 ▾ ｜
 * 真ん中にプロジェクト名といまのブランチ ▾（押すとほかのブランチへ切り替える）と作業場所の切り替え ｜ ブランチ ▾ ｜ 右に外で開く。
 * 狭ければ名前を隠してアイコンだけにする（styles/editor/editor-history-toolbar.css のコンテナクエリ）
 */
export function HistoryToolbar({ ops, projectName, worktreePicker }: { ops: HistoryOps; projectName: string; worktreePicker: ReactNode }) {
  const menu = useContextMenu<MenuKind>();
  const palette = usePopover();
  const others = ops.branches.filter((b) => !b.current);

  return (
    <div className="history-toolbar" role="toolbar" aria-label="Git の操作">
      <div className="history-toolbar-group">
        <ToolButton
          icon={ops.listHidden ? PanelLeftOpen : PanelLeftClose}
          label="一覧"
          tip={ops.listHidden ? "左の一覧を開く" : "左の一覧を閉じる"}
          onClick={ops.toggleList}
        />
        <ToolButton icon={Zap} label="操作" tip="Git の操作を名前で探して実行する" buttonRef={palette.anchor} onClick={palette.toggle} />
      </div>
      <div className="history-toolbar-group">
        <ToolButton icon={CloudDownload} label="フェッチ" tip="リモートの情報を取ってくる（作業場所は変えない）" busy={ops.fetching} onClick={() => void ops.fetch()} />
        <ToolButton
          icon={ArrowDownToLine}
          label="プル"
          tip={ops.upstream ? `「${ops.upstream}」を取り込む` : "取り込む"}
          badge={ops.behind}
          blocked={ops.pullBlocked}
          onClick={() => void ops.pull()}
        />
        <ToolButton
          icon={ArrowUpFromLine}
          label="プッシュ"
          tip={ops.upstream ? `「${ops.upstream}」へプッシュ` : "origin へ公開する"}
          badge={ops.ahead}
          blocked={ops.pushBlocked}
          onClick={() => void ops.push()}
        />
        <span className="history-tool-split">
          <ToolButton icon={Archive} label="退避" tip="コミットしていない変更を退避する（git stash）" onClick={() => void ops.stashSave()} />
          <Caret label="退避のほかの操作" onClick={(e) => menu.toggle(e, "stash")} />
        </span>
      </div>
      <div className="history-toolbar-repo">
        <span className="history-toolbar-name">{projectName}</span>
        <span className="history-toolbar-place">
          <button
            type="button"
            className="history-toolbar-branch"
            data-tip={ops.current ? "押すとほかのブランチに切り替える" : "ブランチから外れています（押すとブランチに切り替える）"}
            onClick={(e) => menu.toggle(e, "switch")}
          >
            <GitBranch size={13} aria-hidden />
            <span className="history-toolbar-branch-name">{ops.current ?? "（ブランチなし）"}</span>
            <ChevronDown size={12} aria-hidden />
          </button>
          {worktreePicker}
        </span>
      </div>
      <div className="history-toolbar-group">
        <span className="history-tool-split">
          <ToolButton icon={GitBranchPlus} label="ブランチ" tip="いまのコミットから新しいブランチを作る" onClick={() => void ops.newBranch()} />
          <Caret label="ブランチのほかの操作" onClick={(e) => menu.toggle(e, "branch")} />
        </span>
      </div>
      <span className="spacer" />
      {ops.canOpenOutside && (
        <div className="history-toolbar-group">
          <ToolButton icon={Share} label="外で開く" tip="作業場所のフォルダを Finder・VS Code・ターミナルで開く" onClick={(e) => menu.toggle(e, "open")} />
        </div>
      )}

      {palette.open && <GitCommandPalette anchor={palette.anchor} ops={ops} onClose={palette.close} />}
      {menu.menu && (
        <PopupMenu at={menu.menu.at} label="Git の操作" ignore=".history-tool, .history-tool-caret, .history-toolbar-branch" onClose={menu.close}>
          {menu.menu.value === "stash" && (
            <>
              <MenuItem onSelect={() => void ops.stashSave()}>変更を退避…</MenuItem>
              <Separator />
              <MenuItem disabled={!ops.hasStash} title={ops.hasStash ? "作業場所に戻して、退避の一覧から消します" : "退避はありません"} onSelect={() => void ops.stashPopLatest()}>
                最新の退避を戻す
              </MenuItem>
              <MenuItem disabled={!ops.hasStash} title={ops.hasStash ? "作業場所に戻し、退避の一覧にも残します" : "退避はありません"} onSelect={() => void ops.stashApplyLatest()}>
                最新の退避を適用
              </MenuItem>
            </>
          )}
          {menu.menu.value === "branch" && (
            <>
              <MenuItem onSelect={() => void ops.newBranch()}>新しいブランチ…</MenuItem>
              <MenuItem onSelect={() => void ops.newTag()}>新しいタグ…</MenuItem>
              <Separator />
              <MenuItem onSelect={ops.newWorktree}>ワークツリーを作る…</MenuItem>
            </>
          )}
          {menu.menu.value === "switch" &&
            (others.length > 0 ? (
              others.map((b) => (
                <MenuItem key={b.name} disabled={b.worktree !== null} title={b.worktree ? `ほかの作業場所で取り出しています（${b.worktree}）` : undefined} onSelect={() => void ops.checkout(b.name)}>
                  {b.name}
                </MenuItem>
              ))
            ) : (
              <MenuItem disabled onSelect={() => undefined}>
                ほかのブランチはありません
              </MenuItem>
            ))}
          {menu.menu.value === "open" && (
            <>
              <MenuItem onSelect={ops.openFinder}>Finder で開く</MenuItem>
              <MenuItem onSelect={ops.openVSCode}>VS Code で開く</MenuItem>
              <MenuItem onSelect={ops.openTerminal}>{ops.terminalLabel} で開く</MenuItem>
            </>
          )}
        </PopupMenu>
      )}
    </div>
  );
}
