import { Columns2, PanelRight, Pencil, Pin, Rows2, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import { open as openTarget } from "@/foundation/ui/navigation/open";
import { reportFailure } from "@/foundation/ui/kit/ask";
import { InlineName } from "@/foundation/ui/kit/InlineName";
import { MenuItem } from "@/foundation/ui/kit/PopupMenu";
import { openNewProject } from "@/features/projects/ui";
import { askNewGroup, MoveToGroupItem, MoveToProjectItem } from "@/features/chatList/ui";
import { discardDraft, moveDraftToProject, openDraftSplit, setDraftGroup, setDraftTitle, togglePinDraft, type PlacedDraft } from "./panelDrafts";
import { CHAT_TITLE_MAX } from "@shared/chat/types";
import { NewChatItem, type NewChatPlace, NEW_CHAT_TITLE } from "@/features/chat/ui";

/** 新しいチャットの既定の開き方（そのプロジェクトのチャットのパネルで、同じグループ・作業場所） */
const openNewChatAt = (place: NewChatPlace) => openTarget({ kind: "newChat", projectId: place.projectId, groupId: place.group, worktree: place.worktree });

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
  draft: PlacedDraft;
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
  const place: NewChatPlace = { projectId: draft.projectId, group: draft.group, worktree: draft.worktree };
  const close = (fn: () => void) => {
    onClose();
    fn();
  };
  // 新しいグループの名前を聞いて作り、作成先をそこにする
  const createGroupAndMove = async () => {
    const group = await askNewGroup(draft.projectId);
    if (group) setDraftGroup(draft, group.id, group.name);
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
      <MoveToGroupItem
        projectId={draft.projectId}
        current={draft.group ?? null}
        onPick={(group) => close(() => setDraftGroup(draft, group?.id, group?.name))}
        onCreate={() => close(() => void createGroupAndMove().catch(reportFailure("グループを作成できませんでした")))}
      />
      {/* 乗せる・押す・→ で横にプロジェクトの一覧を開く（書きかけの文・添付・名前・固定はそのままに、移す先のプロジェクトで開き直す） */}
      <MoveToProjectItem
        current={draft.projectId}
        onPick={(project) => close(() => moveDraftToProject(draft, project.id))}
        onCreate={(name) => close(() => openNewProject({ name, after: { kind: "moveDraft", draft: { panel: draft.panel, key: draft.key } } }))}
      />
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
export function DraftTitleInput({ draft, className, onDone }: { draft: PlacedDraft; className?: string; onDone: () => void }) {
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
export function DraftSplitItems({ draft }: { draft: PlacedDraft }) {
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
