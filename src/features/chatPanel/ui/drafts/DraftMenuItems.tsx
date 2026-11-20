import { ChevronRight, Columns2, Folder, FolderInput, PanelRight, Pencil, Pin, Rows2, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import { api } from "@/foundation/ui/api";
import { openNewChat } from "@/foundation/ui/navigation/router";
import { reportFailure } from "@/foundation/ui/kit/dialogs";
import { InlineName } from "@/foundation/ui/kit/InlineName";
import { useSubmenu } from "@/foundation/ui/kit/MenuFlyout";
import { MenuItem } from "@/foundation/ui/kit/PopupMenu";
import { GroupPickFlyout } from "@/features/groups/ui/GroupPickFlyout";
import { askNewGroupName } from "@/features/groups/ui/groups";
import { ProjectPickFlyout } from "@/features/projects/ui/ProjectPickFlyout";
import { openNewProject } from "@/features/projects/ui/new/openNewProject";
import { discardDraft, moveDraftToProject, openDraftSplit, setDraftGroup, setDraftTitle, togglePinDraft, type PanelDraft } from "./panelDrafts";
import { CHAT_TITLE_MAX } from "@shared/chat/types";
import { NEW_CHAT_TITLE } from "@/features/chat/ui/chatTitle";
import { NewChatItem, type NewChatPlace } from "@/features/chat/ui/open/NewChatItem";

/** 新しいチャットの既定の開き方（そのプロジェクトのチャットのパネルで、同じグループ・作業場所） */
const openNewChatAt = (place: NewChatPlace) => openNewChat(place.projectId, { group: place.group, worktree: place.worktree });

/**
 * 送る前の新しいチャット（下書き）の右クリックのメニューの項目（サイドバーの行・ボードのカード・パネルのタブで共通）。
 * チャットの右クリック（ChatMenuItems）と同じ並び・同じ文とアイコンにし、下書きでもできるものだけを置く:
 * 新しいチャット（同じグループ・作業場所）｜ 開く・その場所だけの項目（before。分けて開くなど）｜ 整理 = 名前を変更・固定 ｜ 移す = グループを変更・プロジェクトを変更 ｜ 削除 ｜ after（タブの表示・タブを閉じるなど）。
 * 子チャットを作成・既読 / 未読・セッション ID をコピー・アーカイブは、まだチャットがない（送るまで作られない）ので出さない
 */
export function DraftMenuItems({
  draft,
  onOpen,
  onNewChat = openNewChatAt,
  onRename,
  onClose,
  before,
  after,
}: {
  draft: PanelDraft;
  /** 開く（サイドバー・ボードだけ。タブはもう開いているので渡さない） */
  onOpen?: () => void;
  /** 同じグループ・作業場所で新しいチャットを始める（既定はそのプロジェクトのチャットのパネルで。タブは右クリックしたタブのペインで） */
  onNewChat?: (place: NewChatPlace) => void;
  /** 名前をその場で変え始める（行・カード・タブの名前を入力欄にする。チャットと同じくダイアログは出さない） */
  onRename: () => void;
  onClose: () => void;
  before?: ReactNode;
  after?: ReactNode;
}) {
  // 「グループを変更」「プロジェクトを変更」の横に開く一覧
  const grouping = useSubmenu();
  const moving = useSubmenu();
  const place: NewChatPlace = { projectId: draft.projectId, group: draft.group, worktree: draft.worktree };
  const close = (fn: () => void) => {
    onClose();
    fn();
  };
  // 新しいグループの名前を聞いて作り、作成先をそこにする
  const createGroupAndMove = async () => {
    const name = await askNewGroupName("作成して移す");
    if (!name) return;
    const group = await api.createGroup(draft.projectId, name);
    setDraftGroup(draft, group.id, group.name);
  };
  const written = draft.text.trim() !== "";
  return (
    <div className="menu-items">
      <NewChatItem place={place} onSelect={() => onNewChat(place)} />
      <div className="menu-separator" role="separator" />
      {onOpen && (
        <MenuItem onSelect={onOpen}>
          <PanelRight size={14} /> 開く
        </MenuItem>
      )}
      {before}
      {(onOpen || before) && <div className="menu-separator" role="separator" />}
      {/* 送ったらその名前のチャットになる（AI に名前を付けてもらわない） */}
      <MenuItem onSelect={onRename}>
        <Pencil size={14} /> 名前を変更
      </MenuItem>
      {/* 固定したものはプロジェクトのいちばん上の「固定」に出し、送ったら、できたチャットも固定する */}
      <MenuItem onSelect={() => togglePinDraft(draft)}>
        <Pin size={14} /> {draft.pinned ? "固定を外す" : "固定"}
      </MenuItem>
      {/* 移す組（チャットの右クリックと同じ区切り） */}
      <div className="menu-separator" role="separator" />
      {/* 乗せる・押す・→ で横にこのプロジェクトのグループの一覧を開く（作成先のグループを変える。送ったらそのグループに入る） */}
      <button {...grouping.trigger}>
        <Folder size={14} /> グループを変更
        <ChevronRight size={14} className="menu-submenu-chevron" aria-hidden />
      </button>
      {grouping.anchor && (
        <GroupPickFlyout
          anchor={grouping.anchor}
          projectId={draft.projectId}
          current={draft.group ?? null}
          onPick={(group) => close(() => setDraftGroup(draft, group?.id, group?.name))}
          onCreate={() => close(() => void createGroupAndMove().catch(reportFailure("グループを作成できませんでした")))}
          onBack={grouping.back}
        />
      )}
      {/* 乗せる・押す・→ で横にプロジェクトの一覧を開く（書きかけの文・添付・名前・固定はそのままに、移す先のプロジェクトで開き直す） */}
      <button {...moving.trigger}>
        <FolderInput size={14} /> プロジェクトを変更
        <ChevronRight size={14} className="menu-submenu-chevron" aria-hidden />
      </button>
      {moving.anchor && (
        <ProjectPickFlyout
          anchor={moving.anchor}
          current={draft.projectId}
          onPick={(project) => close(() => moveDraftToProject(draft, project.id))}
          onCreate={(name) => close(() => openNewProject({ name, after: { kind: "moveDraft", draft: { panel: draft.panel, key: draft.key } } }))}
          onBack={moving.back}
        />
      )}
      <div className="menu-separator" role="separator" />
      {/* 送る前のものは記録に残らないので、アーカイブはなく削除だけ（書きかけの文は消える） */}
      <MenuItem danger title={written ? "書きかけの文も消えます" : undefined} onSelect={() => discardDraft(draft)}>
        <Trash2 size={14} /> 削除
      </MenuItem>
      {after}
    </div>
  );
}

/** 下書きの名前をその場で変える入力欄（サイドバーの行・ボードのカード。チャットの ChatTitleInput と同じ形。決めたら onDone） */
export function DraftTitleInput({ draft, className, onDone }: { draft: PanelDraft; className?: string; onDone: () => void }) {
  return (
    <InlineName
      initial={draft.title ?? ""}
      placeholder={NEW_CHAT_TITLE}
      maxLength={CHAT_TITLE_MAX}
      className={className}
      onSubmit={(title) => {
        onDone();
        setDraftTitle(draft, title);
      }}
      onCancel={onDone}
    />
  );
}

/** 下書きを右・下に分けて開く項目（サイドバーの行・ボードのカード。チャットの右クリックの「右に分けて開く」「下に分けて開く」と同じ） */
export function DraftSplitItems({ draft }: { draft: PanelDraft }) {
  return (
    <>
      <MenuItem onSelect={() => openDraftSplit(draft, "row")}>
        <Columns2 size={14} /> 右に分けて開く
      </MenuItem>
      <MenuItem onSelect={() => openDraftSplit(draft, "column")}>
        <Rows2 size={14} /> 下に分けて開く
      </MenuItem>
    </>
  );
}
