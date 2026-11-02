import { Archive, Folder, Plus } from "lucide-react";
import { memo, useState } from "react";
import { agentStateOf } from "../../../../core/board";
import type { AgentState, Approval, ProjectSummary, Run, RunGroup } from "../../../../core/types";
import { api } from "../../api";
import { useChatSearch } from "../../chatSearch";
import { alertDialog } from "../../dialogs";
import { confirmDeleteGroup, useGroupDrop } from "../../groups";
import { useRunRename } from "../../hooks/useRunRename";
import { useStoredChoice, useStoredFlag, useStoredFlagMap } from "../../hooks/useStoredState";
import { projectHue } from "../../projectColor";
import { navigate, openNewChat, openRun, type Route } from "../../router";
import { CardMenu } from "../CardMenu";
import { useGroupMenu } from "../GroupMenu";
import { IconButton } from "../IconButton";
import { InlineName } from "../InlineName";
import { SearchField } from "../SearchField";
import { ChatRow } from "./ChatRow";
import { GroupToggle } from "./GroupToggle";
import { CHAT_GROUPINGS, type ChatGrouping } from "./ChatGroupingMenu";
import { GroupedChatRows } from "./GroupedChatRows";
import { WorkspaceHead } from "./WorkspaceHead";

const GROUPING_KEY = "kickoff:sidebar-grouping";
const SHOW_ARCHIVED_KEY = "kickoff:sidebar-show-archived";

// プロジェクトを切り替えても、中身の変わらないページは描き直さない
export const WorkspacePage = memo(function WorkspacePage({
  project,
  runs,
  groups,
  approvals,
  route,
  hidden,
  collapsed,
  onCollapsedChange,
  headDrag,
}: {
  project: ProjectSummary;
  runs: Run[];
  groups: RunGroup[];
  approvals: Approval[];
  route: Route;
  hidden: boolean;
  /** チャット一覧を閉じているか（縦並びの「すべて閉じる・開く」で変えるので、外で持つ） */
  collapsed: boolean;
  onCollapsedChange: (projectId: number, collapsed: boolean) => void;
  /** 縦並びのとき: 見出しのカードをつかんでプロジェクトを並べ替える */
  headDrag?: { onDragStart: (e: React.DragEvent) => void; onDragEnd: () => void };
}) {
  const [grouping, setGrouping] = useStoredChoice<ChatGrouping>(GROUPING_KEY, CHAT_GROUPINGS, "recent");
  // アーカイブ済みのチャットを一覧の下に出すか（どのプロジェクトでも同じ。はじめは出す）
  const [showArchived, setShowArchived] = useStoredFlag(SHOW_ARCHIVED_KEY, true);
  // 見出しのクリックでチャット一覧を開閉する
  const toggleCollapsed = () => onCollapsedChange(project.id, !collapsed);
  const waitingCount = approvals.filter((a) => a.project_id === project.id).length;
  const isActive = route.name === "project" && route.id === project.id;
  // プロジェクト内の検索: チャット名と、やり取りの中身（サーバーで全文検索）の両方で絞り込む
  const [query, setQuery] = useState("");
  const { keyword, matches } = useChatSearch(query);

  const withState = (run: Run) => ({ run, state: agentStateOf(run, approvals.some((a) => a.run_id === run.id)) });
  const allRows = runs.filter((r) => !r.archived_at).map(withState);
  // アーカイブしたチャット（一覧の下にまとめて、開閉できる。最初は閉じておく）
  const archivedRows = runs.filter((r) => r.archived_at).map(withState);
  const [archivedOpen, setArchivedOpen] = useStoredFlag(`kickoff:archived-open:${project.id}`);
  const toggleArchived = () => setArchivedOpen(!archivedOpen);
  // チャットの右クリックメニュー（開く・名前を変更・アーカイブ・削除）
  const [rowMenu, setRowMenu] = useState<{ x: number; y: number; run: Run } | null>(null);
  const rows = allRows.filter(({ run }) => matches(run));
  const archivedMatches = archivedRows.filter(({ run }) => matches(run));

  // 自分で作ったグループ
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState<number>();
  // グループの開閉（グループごとに記憶）
  const groupClosed = useStoredFlagMap("kickoff:group-closed:");
  // 「グループなし」の開閉（プロジェクトごとに記憶。検索中は開いて見せる）
  const [ungroupedClosed, setUngroupedClosed] = useStoredFlag(`kickoff:ungrouped-closed:${project.id}`);
  const toggleUngrouped = () => setUngroupedClosed(!ungroupedClosed);
  const startCreate = () => {
    if (collapsed) toggleCollapsed();
    setCreating(true);
  };
  const removeGroup = async (group: RunGroup) => {
    if (await confirmDeleteGroup(group)) await api.deleteGroup(group.id);
  };
  // グループの「…」メニュー（右クリックでも開く）
  const groupMenu = useGroupMenu({ onRename: (g) => setRenaming(g.id), onDelete: (g) => void removeGroup(g) });
  // グループ・グループなしをドロップ先にする。チャットはそのグループへ、グループの見出しはその位置へ並べ替える
  const { reorder, over: dropOver, dropProps: dropTarget } = useGroupDrop({
    groups,
    runs,
    onReorder: (ids) => void api.reorderGroups(project.id, ids),
    onMoveRun: (run, groupId) => void api.setRunGroup(run.id, groupId),
  });
  const groupIds = new Set(groups.map((g) => g.id));
  const groupedRows = (id: number) => rows.filter(({ run }) => run.group_id === id);
  const ungroupedRows = rows.filter(({ run }) => run.group_id === null || !groupIds.has(run.group_id));


  // 右クリックメニューの「名前を変更」は、行の名前をその場で入力欄にする
  const rename = useRunRename((m) => void alertDialog("名前を変更できませんでした", m));
  const renderRow = ({ run, state }: { run: Run; state: AgentState }) => (
    <ChatRow
      key={run.id}
      run={run}
      state={state}
      active={route.name === "run" && route.runId === run.id}
      onMenu={(at) => setRowMenu({ ...at, run })}
      rename={rename.editorFor(run)}
    />
  );

  return (
    <section
      className="workspace-page"
      data-project-id={project.id}
      aria-hidden={hidden}
      inert={hidden}
      style={{ "--ws-hue": `${projectHue(project.id)}` } as React.CSSProperties}
    >
      <WorkspaceHead
        project={project}
        groups={groups}
        active={isActive}
        collapsed={collapsed}
        onToggleCollapsed={toggleCollapsed}
        chatCount={allRows.length}
        waitingCount={waitingCount}
        grouping={grouping}
        onGroupingChange={setGrouping}
        showArchived={showArchived}
        onShowArchived={setShowArchived}
        onCreateGroup={startCreate}
        headDrag={headDrag}
      />
      {!collapsed && allRows.length > 0 && (
        <SearchField value={query} onChange={setQuery} placeholder="チャット名で検索" label={`${project.name} のチャットを検索`} />
      )}
      {!collapsed && keyword && rows.length === 0 && <p className="chat-search-empty">「{keyword}」に一致するチャットはありません</p>}
      {!collapsed && creating && (
        <div className="custom-group-head editing">
          <Folder size={13} aria-hidden />
          <InlineName
            placeholder="グループ名（例: コードレビュー）"
            onSubmit={(name) => {
              setCreating(false);
              void api.createGroup(project.id, name);
            }}
            onCancel={() => setCreating(false)}
          />
        </div>
      )}
      {!collapsed &&
        groups.map((group) => {
          const members = groupedRows(group.id);
          // 検索中は、一致するチャットがないグループを隠す
          if (keyword && members.length === 0) return null;
          const closed = groupClosed.get(group.id) && !keyword;
          return (
            <div
              key={group.id}
              className={`custom-group ${dropOver === group.id ? "drop-target" : ""} ${reorder.classFor(group.id)}`}
              {...dropTarget(group.id)}
            >
              <div
                className={`custom-group-head ${route.name === "project" && route.tab === "groups" && route.group === group.id ? "active" : ""}`}
                draggable={renaming !== group.id}
                title="ドラッグでグループを並べ替える（右クリックでメニュー）"
                onContextMenu={(e) => groupMenu.openFor(group, e)}
                {...reorder.handle(group.id)}
              >
                <GroupToggle open={!closed} onToggle={() => groupClosed.toggle(group.id)} icon={Folder} />
                {renaming === group.id ? (
                  <InlineName
                    initial={group.name}
                    onSubmit={(name) => {
                      setRenaming(undefined);
                      void api.renameGroup(group.id, name);
                    }}
                    onCancel={() => setRenaming(undefined)}
                  />
                ) : (
                  <button
                    type="button"
                    className="custom-group-name"
                    title="プロジェクトのグループで表示（ダブルクリックで名前を変更）"
                    onClick={() => navigate({ name: "project", id: project.id, tab: "groups", group: group.id })}
                    onDoubleClick={() => setRenaming(group.id)}
                  >
                    {group.name}
                  </button>
                )}
                {/* 名前の編集中は、ほかの操作を隠す（鉛筆を押し直して編集が始まり直さないように） */}
                {renaming !== group.id && (
                  <>
                    <span className="custom-group-count">{members.length}</span>
                    <IconButton
                      icon={Plus}
                      label={`${group.name} に新しいチャット`}
                      title={`「${group.name}」に新しいチャット`}
                      size={13}
                      className="custom-group-add"
                      onClick={() => openNewChat(project.id, { group: group.id })}
                    />
                    {groupMenu.button(group)}
                  </>
                )}
              </div>
              {!closed &&
                (members.length === 0 ? (
                  <p className="custom-group-empty">チャットをここへドラッグ</p>
                ) : (
                  <ul className="chat-rows custom-group-rows">{members.map(renderRow)}</ul>
                ))}
            </div>
          );
        })}
      {!collapsed && groups.length > 0 && ungroupedRows.length > 0 && (
        <div className={`custom-group-head ungrouped ${dropOver === "none" ? "drop-target" : ""}`} {...dropTarget(null)}>
          <GroupToggle open={!(ungroupedClosed && !keyword)} onToggle={toggleUngrouped} />
          <button className="custom-group-name ungrouped-name" onClick={toggleUngrouped}>
            グループなし
          </button>
          <span className="custom-group-count">{ungroupedRows.length}</span>
          <IconButton icon={Plus} label="グループなしで新しいチャット" size={13} className="custom-group-add" onClick={() => openNewChat(project.id)} />
          {/* グループの見出しと＋の位置をそろえるため、右端の「…」の分を空けておく */}
          <span className="group-menu-spacer" aria-hidden />
        </div>
      )}
      {groupMenu.menu}
      {collapsed || (keyword && rows.length === 0) || (groups.length > 0 && ungroupedClosed && !keyword) ? null : rows.length === 0 ? (
        <button className="chat-row ghost" onClick={() => openNewChat(project.id)}>
          <Plus size={13} /> 最初のチャットを始める
        </button>
      ) : ungroupedRows.length === 0 ? null : grouping === "recent" ? (
        <ul className="chat-rows" {...(groups.length > 0 ? dropTarget(null) : {})}>
          {ungroupedRows.map(renderRow)}
        </ul>
      ) : (
        <GroupedChatRows grouping={grouping} projectId={project.id} rows={ungroupedRows} renderRow={renderRow} forceOpen={Boolean(keyword)} />
      )}
      {!collapsed && showArchived && archivedMatches.length > 0 && (
        <div className="archived-section">
          <div className="custom-group-head ungrouped">
            <GroupToggle open={archivedOpen || Boolean(keyword)} onToggle={toggleArchived} icon={Archive} iconSize={12} />
            <button className="custom-group-name ungrouped-name" onClick={toggleArchived}>
              アーカイブ済み
            </button>
            <span className="custom-group-count">{archivedMatches.length}</span>
          </div>
          {(archivedOpen || keyword) && <ul className="chat-rows archived-rows">{archivedMatches.map(renderRow)}</ul>}
        </div>
      )}
      {rowMenu && (
        <CardMenu
          {...rowMenu}
          onOpenPanel={(run) => openRun(run.project_id, run.id)}
          onRename={rename.start}
          onClose={() => setRowMenu(null)}
          onError={(m) => void alertDialog("操作できませんでした", m)}
        />
      )}
    </section>
  );
});
