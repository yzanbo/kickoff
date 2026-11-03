import { Archive, ArchiveRestore, ChevronRight, Copy, FolderInput, Mail, MailOpen, PanelRight, Pencil, Pin, PinOff, Trash2 } from "lucide-react";
import { useState, type MouseEvent, type ReactNode } from "react";
import type { Run } from "../../../../core/types";
import { api } from "../../api";
import { chatTitle } from "../../chatTitle";
import { confirmDialog } from "../../dialogs";
import { errorMessage } from "../../errors";
import { openRun, useRoute } from "../../router";
import { confirmDeleteRun, toggleArchiveRun, togglePinRun } from "../../runActions";
import { openNewProject } from "../newProject/openNewProject";
import { MenuItem } from "../PopupMenu";
import { ProjectPickFlyout } from "./ProjectPickFlyout";

/**
 * チャットの右クリックのメニューの項目（サイドバーの行・ボードのカード・パネルのチャットのタブで共通）:
 * 開く・名前を変更・既読 / 未読・固定・セッション ID をコピー・プロジェクトを変更・アーカイブ・削除。
 * before / after: その場所だけの項目（タブの分割・閉じるなど）。「プロジェクトを変更」に乗せる・押すと、横にプロジェクトの一覧（ProjectPickFlyout）を開く
 */
export function ChatMenuItems({
  run,
  onOpen,
  onRename,
  onClose,
  onError,
  before,
  after,
}: {
  run: Run;
  /** 開く（サイドバー・ボードだけ。タブはもう開いているので渡さない） */
  onOpen?: (run: Run) => void;
  /** 名前をその場で変え始める */
  onRename: (run: Run) => void;
  onClose: () => void;
  onError: (message: string) => void;
  before?: ReactNode;
  after?: ReactNode;
}) {
  // 「プロジェクトを変更」の項目（横に一覧を開いているとき）
  const [moving, setMoving] = useState<HTMLElement | null>(null);
  const route = useRoute();
  // いま開いているチャットを移したら、移した先のプロジェクトで開き直す（元のボードからは消えるため）
  const viewing = route.name === "run" && route.runId === run.id;
  // 失敗はお知らせで出す（メニューは閉じる）
  const act = (fn: () => Promise<unknown>) => {
    onClose();
    void fn().catch((e: unknown) => onError(errorMessage(e)));
  };
  // ほかの項目に乗せたら横の一覧を閉じる
  const onHover = (e: MouseEvent) => {
    const target = e.target as HTMLElement;
    if (!moving || target.closest(".project-pick") || target.closest(".menu-submenu")) return;
    if (target.closest("button")) setMoving(null);
  };
  return (
    <div className="menu-items" onMouseOver={onHover}>
      {before}
      {onOpen && (
        <MenuItem onSelect={() => onOpen(run)}>
          <PanelRight size={14} /> 開く
        </MenuItem>
      )}
      <MenuItem onSelect={() => onRename(run)}>
        <Pencil size={14} /> 名前を変更
      </MenuItem>
      {/* 未読の印（サイドバーで太字になる。次に開くまで残る） */}
      {run.attention ? (
        <MenuItem onSelect={() => act(() => api.markSeen(run.id))}>
          <MailOpen size={14} /> 既読にする
        </MenuItem>
      ) : (
        <MenuItem onSelect={() => act(() => api.markUnseen(run.id))}>
          <Mail size={14} /> 未読にする
        </MenuItem>
      )}
      {/* 固定はサイドバーの、プロジェクトのいちばん上のまとまりに出す（アーカイブしたものは固定しない） */}
      {!run.archived_at && (
        <MenuItem onSelect={() => act(() => togglePinRun(run))}>
          {run.pinned ? <PinOff size={14} /> : <Pin size={14} />} {run.pinned ? "固定をやめる" : "サイドバーの上に固定"}
        </MenuItem>
      )}
      {/* Claude Code で同じ会話を続けるとき（claude --resume <ID>）などに使う */}
      {run.session_id && (
        <MenuItem onSelect={() => act(() => navigator.clipboard.writeText(run.session_id ?? ""))}>
          <Copy size={14} /> セッション ID をコピー
        </MenuItem>
      )}
      {/* 乗せる・押す・→ で横にプロジェクトの一覧を開く（メニューは閉じない） */}
      <button
        role="menuitem"
        className={moving ? "menu-submenu open" : "menu-submenu"}
        aria-haspopup="menu"
        aria-expanded={moving !== null}
        onMouseEnter={(e) => setMoving(e.currentTarget)}
        onClick={(e) => setMoving(e.currentTarget)}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") {
            e.preventDefault();
            setMoving(e.currentTarget);
          }
        }}
      >
        <FolderInput size={14} /> プロジェクトを変更
        <ChevronRight size={14} className="menu-submenu-chevron" aria-hidden />
      </button>
      {moving && (
        <ProjectPickFlyout
          anchor={moving}
          current={run.project_id}
          onPick={(project) => act(() => moveRun(run, project, viewing))}
          onCreate={(name) => {
            onClose();
            // 作ったら、そのプロジェクトへこのチャットを移す（確かめてから）
            openNewProject({ name, onCreated: (project) => void moveRun(run, project, viewing).catch((e: unknown) => onError(errorMessage(e))) });
          }}
          onBack={() => {
            moving.focus();
            setMoving(null);
          }}
        />
      )}
      <div className="menu-separator" role="separator" />
      <MenuItem onSelect={() => act(() => toggleArchiveRun(run))}>
        {run.archived_at ? <ArchiveRestore size={14} /> : <Archive size={14} />} {run.archived_at ? "アーカイブから戻す" : "アーカイブ"}
      </MenuItem>
      <MenuItem danger onSelect={() => act(() => confirmDeleteRun(run))}>
        <Trash2 size={14} /> 削除…
      </MenuItem>
      {after}
    </div>
  );
}

/** 移す前に確かめる（作業フォルダが変わる。グループ・作業場所（ワークツリー）は外れる）。follow: 移したあと、移した先でそのチャットを開く */
async function moveRun(run: Run, project: { id: number; name: string }, follow: boolean): Promise<void> {
  const lost = [run.group_id !== null && "グループ", run.worktree_path && "作業場所（ワークツリー）"].filter(Boolean).join("・");
  const ok = await confirmDialog({
    title: `チャット「${chatTitle(run.title)}」を「${project.name}」へ移しますか？`,
    message: `これからの作業は、移した先のプロジェクトのフォルダ（本体）で行います。会話はそのまま続けられます。${lost ? `いまの${lost}は外れます。` : ""}`,
    confirmLabel: "移動する",
  });
  if (!ok) return;
  await api.moveRun(run.id, project.id);
  if (follow) openRun(project.id, run.id);
}
