import { Folder, Plus } from "lucide-react";
import type { ReactNode } from "react";
import type { RunGroup } from "../../../../core/types";
import { api } from "../../api";
import { cx } from "../../cx";
import { flashGroup } from "../../groups";
import { navigate, openNewChat, useRoute } from "../../router";
import type { BoardEntry } from "../board/boardColumns";
import { Collapse } from "../Collapse";
import { IconButton } from "../IconButton";
import { InlineName } from "../InlineName";
import type { ChatGrouping } from "./chatGroupings";
import { GroupedChatRows } from "./GroupedChatRows";
import { GroupToggle, pressedLeftOfName } from "./GroupToggle";
import type { GroupSectionProps } from "./useGroupSections";

/**
 * サイドバーの、自分で作ったグループ 1 つ（見出しと、開閉する中身）。
 * 左の矢印を押すと開閉する。見出しのほかの部分を押すと、選んでいて開いていれば閉じ、それ以外は選び直して開く（そのグループのボードを開いてハイライトする。サイドバー全体で同じ）。
 * 名前のダブルクリックで名前を変える・ドラッグで並べ替える・チャットをドロップしてグループへ移す・右クリックでメニュー
 */
export function CustomGroupSection({
  projectId,
  group,
  members,
  closed,
  onSetClosed,
  filtering,
  grouping,
  renderRow,
  section: { menu, renaming, onRenameStart, onRenameEnd, dropClass, dropProps, dragProps },
}: {
  projectId: number;
  group: RunGroup;
  members: BoardEntry[];
  closed: boolean;
  onSetClosed: (closed: boolean) => void;
  /** 検索・絞り込みの間（並べ方のまとまりを開いて見せる） */
  filtering: boolean;
  grouping: ChatGrouping;
  renderRow: (row: BoardEntry) => ReactNode;
  /** 見出しの操作の束（useGroupSections の sectionProps） */
  section: GroupSectionProps;
}) {
  // 選んでいる = いまそのグループのボードを見ている
  const route = useRoute();
  const selected = route.name === "project" && route.id === projectId && route.tab === "groups" && route.group === group.id;
  /**
   * 見出しの矢印以外を押したとき（サイドバー全体で同じ）: 選んでいて開いていれば閉じる。
   * それ以外（選んでいない・選んでいて閉じている）は、選び直して開く（そのグループのボードを開いてハイライトし、中も開く）
   */
  const press = () => {
    if (selected && !closed) return onSetClosed(true);
    navigate({ name: "project", id: projectId, tab: "groups", group: group.id });
    flashGroup(group.id);
    if (closed) onSetClosed(false);
  };
  const pressLabel = selected && !closed ? "閉じる" : `「${group.name}」のボードを開く`;
  return (
    <div className={cx("custom-group", dropClass)} {...dropProps}>
      <div
        className={cx("custom-group-head", selected && "active")}
        draggable={!renaming}
        title="ドラッグでグループを並べ替える（右クリックでメニュー・名前をダブルクリックで名前を変更）"
        onContextMenu={(e) => menu.openFor(group, e)}
        onClick={(e) => {
          // 矢印以外のところを押すと、選んで開く / 開閉する（矢印・＋・…・名前の入力欄は除く）
          if ((e.target as HTMLElement).closest("button, input")) return;
          // 名前より左（矢印のまわり・フォルダのアイコン）は、矢印を押したのと同じく開閉だけ
          if (pressedLeftOfName(e, e.currentTarget.querySelector(".custom-group-name, input"))) return onSetClosed(!closed);
          press();
        }}
        {...dragProps}
      >
        {/* 開閉の矢印（ほかのまとまりと同じ）とフォルダのアイコン。押すと開閉する */}
        <GroupToggle open={!closed} onToggle={() => onSetClosed(!closed)} icon={Folder} />
        {renaming ? (
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
        )}
        {/* 名前の編集中は、ほかの操作を隠す（鉛筆を押し直して編集が始まり直さないように） */}
        {!renaming && (
          <>
            <span className="custom-group-count">{members.length}</span>
            <IconButton
              icon={Plus}
              label={`${group.name} に新しいチャット`}
              title={`「${group.name}」に新しいチャット`}
              size={13}
              className="custom-group-add"
              onClick={() => openNewChat(projectId, { group: group.id })}
            />
            {menu.button(group)}
          </>
        )}
      </div>
      <Collapse open={!closed} indent>
        {members.length === 0 ? (
          <p className="custom-group-empty">チャットをここへドラッグ</p>
        ) : grouping !== "recent" ? (
          // 並べ方でまとめているときは、グループの中も同じようにまとめる
          <div className="custom-group-grouped">
            <GroupedChatRows grouping={grouping} projectId={projectId} scope={group.id} rows={members} renderRow={renderRow} forceOpen={filtering} />
          </div>
        ) : (
          <ul className="chat-rows custom-group-rows">{members.map(renderRow)}</ul>
        )}
      </Collapse>
    </div>
  );
}
