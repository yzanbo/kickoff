import { Folder, SquarePen } from "lucide-react";
import type { ReactNode } from "react";
import type { Chat, ChatGroup } from "@shared/types";
import { api } from "@/api";
import { cx } from "@/lib/cx";
import { openNewChat } from "@/app/router";
import type { ChatBucket } from "@/features/chatList/buckets";
import { Collapse } from "@/ui/Collapse";
import { IconButton } from "@/ui/IconButton";
import { InlineName } from "@/ui/InlineName";
import { GroupedChatRows } from "./GroupedChatRows";
import { FoldHead } from "@/ui/FoldHead";
import type { PanelDraft } from "@/features/panel/state/panelDrafts";
import { DraftRows } from "./DraftRows";
import type { GroupSectionProps } from "./useGroupSections";
import { huedHeadProps } from "./bucketColor";
import { ArchivedBucketFold } from "./ArchivedBucketFold";

/**
 * サイドバーの、自分で作ったグループ 1 つ（見出しと、開閉する中身。bucket は bucketChats のグループのまとまりで、中の段があれば状態ごとに分ける）。
 * 左の矢印を押すと開閉する。見出しのほかの部分を押しても開閉する。
 * 名前のダブルクリックで名前を変える・ドラッグで並べ替える・チャットをドロップしてグループへ移す・右クリックでメニュー。
 * アーカイブ済みを出しているときは、中身のいちばん下にこのグループのアーカイブ済み（ArchivedBucketFold）
 */
export function CustomGroupSection({
  projectId,
  group,
  bucket,
  closed,
  onSetClosed,
  filtering,
  renderRow,
  hue = null,
  allChats,
  section: { menu, renaming, onRenameStart, onRenameEnd, dropClass, dropProps, dragProps },
}: {
  projectId: number;
  group: ChatGroup;
  /** グループのチャット（絞り込みを通したもの）と、このグループで始める下書き（中身のいちばん上に出す） */
  bucket: ChatBucket<PanelDraft>;
  closed: boolean;
  onSetClosed: (closed: boolean) => void;
  /** 検索・絞り込みの間（並べ方のまとまりを開いて見せる） */
  filtering: boolean;
  renderRow: (chat: Chat) => ReactNode;
  /** 見出しの色（「まとまりを色付きで表示」のとき。タブの列のまとまりと同じ色。null なら付けない） */
  hue?: number | null;
  /** 見出しの操作の束（useGroupSections の sectionProps） */
  section: GroupSectionProps;
  /** プロジェクトのチャット（アーカイブ済みも。中のアーカイブ済みへ落としたチャットを引く） */
  allChats: readonly Chat[];
}) {
  const { chats: members, drafts } = bucket;
  // 見出しを押すと開閉する（前はそのグループのボードを開いていたが、プロジェクトのボードの列の分け方をなくし、グループのボードの画面もなくした）
  const press = () => onSetClosed(!closed);
  const pressLabel = closed ? "開く" : "閉じる";
  return (
    <div className={cx("custom-group", dropClass)} {...dropProps}>
      {/* 開閉の矢印（ほかのまとまりと同じ）とフォルダのアイコン。押すと開閉する。名前の編集中は、ほかの操作を隠す（押し直して編集が始まり直さないように） */}
      <FoldHead
        look="group"
        className={huedHeadProps(hue).className}
        style={huedHeadProps(hue).style}
        draggable={!renaming}
        title="ドラッグでグループを並べ替える（右クリックでメニュー・名前をダブルクリックで名前を変更）"
        onContextMenu={(e) => menu.openFor(group, e)}
        onClick={(e) => {
          // 矢印以外のところを押しても開閉する（矢印・＋・…・名前の入力欄は除く）
          if ((e.target as HTMLElement).closest("button, input")) return;
          press();
        }}
        {...dragProps}
        open={!closed}
        onToggle={() => onSetClosed(!closed)}
        icon={Folder}
        name={
          renaming ? (
            <InlineName
              initial={group.name}
              onSubmit={(name) => {
                onRenameEnd();
                void api.renameGroup(group.id, name);
              }}
              onCancel={onRenameEnd}
            />
          ) : (
            <button
              type="button"
              className="custom-group-name"
              title={`${pressLabel}（ダブルクリックで名前を変更）`}
              onClick={(e) => {
                // ダブルクリック（名前の変更）の 2 回目は数えない
                if (e.detail > 1) return;
                press();
              }}
              onDoubleClick={onRenameStart}
            >
              {group.name}
            </button>
          )
        }
        count={renaming ? undefined : members.length}
        actions={
          !renaming && (
            <>
              <IconButton
                icon={SquarePen}
                label={`${group.name} に新しいチャット`}
                title={`「${group.name}」に新しいチャット`}
                size={13}
                className="custom-group-add"
                onClick={() => openNewChat(projectId, { group: group.id })}
              />
              {menu.button(group)}
            </>
          )
        }
      />
      <Collapse open={!closed} indent>
        <DraftRows drafts={drafts} />
        {/* チャットのないグループは、開いていても何も出さない（落とし先は見出しを含むまとまり全体。前は「チャットをここへドラッグ」を出していた） */}
        {members.length === 0 ? null : bucket.children ? (
          // 状態順のときは、グループの中を状態ごとの見出しに分ける
          <div className="custom-group-grouped">
            <GroupedChatRows buckets={bucket.children} renderRow={renderRow} forceOpen={filtering} />
          </div>
        ) : (
          <ul className="chat-rows">{members.map(renderRow)}</ul>
        )}
        {/* このグループのアーカイブ済み（アーカイブ済みを出しているとき。落とすとアーカイブ、中の行をグループへ落とすと戻す） */}
        {bucket.archived && <ArchivedBucketFold projectId={projectId} bucket={bucket.archived} chats={allChats} groupId={group.id} renderRow={renderRow} forceOpen={filtering} />}
      </Collapse>
    </div>
  );
}
