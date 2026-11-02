import { Folder, Plus } from "lucide-react";
import type { DragEvent, MouseEvent, ReactNode } from "react";
import type { AgentState, Run, RunGroup } from "../../../../core/types";
import { api } from "../../api";
import { cx } from "../../cx";
import { flashGroup } from "../../groups";
import { navigate, openNewChat } from "../../router";
import { Chevron } from "../Chevron";
import { Collapse } from "../Collapse";
import { IconButton } from "../IconButton";
import { InlineName } from "../InlineName";
import type { ChatGrouping } from "./chatGroupings";
import { GroupedChatRows } from "./GroupedChatRows";

type Row = { run: Run; state: AgentState };

/**
 * サイドバーの、自分で作ったグループ 1 つ（見出しと、開閉する中身）。
 * 見出しを押すと（プロジェクトのカードと同じ）、選んでいなければ選び（そのグループのボードを開く）、
 * 選んでいれば開閉する。フォルダのアイコンは、選んでいるグループに乗せたときだけ開閉の矢印に変わる。
 * 名前のダブルクリックで名前を変える・ドラッグで並べ替える・チャットをドロップしてグループへ移す・右クリックでメニュー
 */
export function CustomGroupSection({
  projectId,
  group,
  members,
  closed,
  onSetClosed,
  selected,
  filtering,
  grouping,
  renderRow,
  renaming,
  onRenameStart,
  onRenameEnd,
  menu,
  dropClass,
  dropProps,
  dragProps,
}: {
  projectId: number;
  group: RunGroup;
  members: Row[];
  closed: boolean;
  onSetClosed: (closed: boolean) => void;
  /** 選んでいる = いまそのグループのボードを見ている */
  selected: boolean;
  /** 検索・絞り込みの間（並べ方のまとまりを開いて見せる） */
  filtering: boolean;
  grouping: ChatGrouping;
  renderRow: (row: Row) => ReactNode;
  renaming: boolean;
  onRenameStart: () => void;
  onRenameEnd: () => void;
  menu: { openFor: (group: RunGroup, e: MouseEvent) => void; button: (group: RunGroup) => ReactNode };
  /** ドロップ先・並べ替えの見た目 */
  dropClass?: string;
  dropProps: Record<string, unknown>;
  dragProps: { onDragStart: (e: DragEvent) => void; onDragEnd: () => void };
}) {
  /** 見出しを押したとき: 選んでいなければ選ぶ（開閉はしない）、選んでいれば開閉する */
  const press = () => {
    if (selected) return onSetClosed(!closed);
    navigate({ name: "project", id: projectId, tab: "groups", group: group.id });
    flashGroup(group.id);
  };
  const pressLabel = selected ? (closed ? "開く" : "閉じる") : `「${group.name}」のボードを開く`;
  return (
    <div className={cx("custom-group", dropClass)} {...dropProps}>
      <div
        className={cx("custom-group-head", selected && "active")}
        draggable={!renaming}
        title="ドラッグでグループを並べ替える（右クリックでメニュー・名前をダブルクリックで名前を変更）"
        onContextMenu={(e) => menu.openFor(group, e)}
        onClick={(e) => {
          // 見出しのどこを押しても同じ（＋・…・名前の入力欄は除く）
          if ((e.target as HTMLElement).closest("button, input")) return;
          press();
        }}
        {...dragProps}
      >
        {/* フォルダのアイコン。選んでいるグループに乗せたときだけ、開閉の矢印に変わる */}
        <button
          type="button"
          className="custom-group-toggle group-icon-toggle"
          aria-expanded={selected ? !closed : undefined}
          aria-label={selected ? `「${group.name}」を${pressLabel}` : pressLabel}
          title={pressLabel}
          onClick={press}
        >
          <Folder size={13} className="group-icon-folder" aria-hidden />
          <span className="group-icon-chevron" aria-hidden>
            <Chevron open={!closed} />
          </span>
        </button>
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
