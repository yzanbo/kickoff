import { Archive, Folder, Pin, Plus } from "lucide-react";
import { memo, useState } from "react";
import { BOARD_COLUMN_LABELS, type AgentState, type ProjectSummary, type Run, type RunGroup } from "../../../../core/types";
import { api } from "../../api";
import { alertDialog } from "../../dialogs";
import { useRunRename } from "../../hooks/useRunRename";
import { useSharedChoice, useStoredFlag, useStoredFlagMap } from "../../hooks/useStoredState";
import { projectHue } from "../../projectColor";
import { SIDEBAR_GROUP_CLOSED_PREFIX, SIDEBAR_GROUPING_KEY, sidebarArchivedOpenKey, sidebarPinnedClosedKey, sidebarUngroupedClosedKey } from "../../storageKeys";
import { openNewChat, openRun, routeProjectId, useRoute } from "../../router";
import { CardMenu } from "../menus/CardMenu";
import { InlineName } from "../InlineName";
import { SearchField } from "../SearchField";
import { ChatRow } from "./ChatRow";
import { CHAT_GROUPINGS, type ChatGrouping } from "./chatGroupings";
import { GroupedChatRows } from "./GroupedChatRows";
import { CustomGroupSection } from "./CustomGroupSection";
import { useGroupSections } from "./useGroupSections";
import { DraftRows } from "./DraftRows";
import { RowSection } from "./RowSection";
import { stateCounts } from "../../runState";
import { useFoldAll, useShowArchivedChats } from "./sidebarFlags";
import { UngroupedHead } from "./UngroupedHead";
import { useWorkspaceRows } from "./useWorkspaceRows";
import { WorkspaceHead } from "./WorkspaceHead";
import { Collapse } from "../Collapse";

// プロジェクトを切り替えても、中身の変わらないページは描き直さない
export const WorkspacePage = memo(function WorkspacePage({
  project,
  runs,
  groups,
  hidden,
  collapsed,
  onCollapsedChange,
  headDrag,
  searchAll = "",
}: {
  project: ProjectSummary;
  runs: Run[];
  groups: RunGroup[];
  hidden: boolean;
  /** チャット一覧を閉じているか（縦並びの「すべて閉じる・開く」で変えるので、外で持つ） */
  collapsed: boolean;
  onCollapsedChange: (projectId: number, collapsed: boolean) => void;
  /** 縦並びのとき: 見出しのカードをつかんでプロジェクトを並べ替える */
  headDrag?: { onDragStart: (e: React.DragEvent) => void; onDragEnd: () => void };
  /** すべてのプロジェクトをまたぐ検索欄（縦並びの上）の検索語。プロジェクトの検索欄が空のときに使う */
  searchAll?: string;
}) {
  const route = useRoute();
  const [grouping] = useSharedChoice<ChatGrouping>(SIDEBAR_GROUPING_KEY, CHAT_GROUPINGS, "recent");
  // アーカイブ済みのチャットを一覧の下に出すか（どのプロジェクトでも同じ。はじめは出さない）
  const [showArchived] = useShowArchivedChats();
  // 見出しのクリックでチャット一覧を開閉する
  const toggleCollapsed = () => onCollapsedChange(project.id, !collapsed);
  // 選んでいる = いまの画面がこのプロジェクト（カンバン・チャットなど）
  const isActive = routeProjectId(route) === project.id;
  // 行の絞り込み（検索・自分待ち・状態）と、固定・グループ・アーカイブ済みへの分け方
  const list = useWorkspaceRows({ runs, groups, searchAll });
  const { waitingOnly, query, setQuery, keyword, stateFilter, setStateFilter, filtering, pending, allRows, visibleRows, pinnedRows, rows, archivedMatches, ungroupedRows } = list;
  // 開閉の記憶: アーカイブ済み・固定（プロジェクトごと）
  const [archivedOpen, setArchivedOpen] = useStoredFlag(sidebarArchivedOpenKey(project.id));
  const toggleArchived = () => setArchivedOpen(!archivedOpen);
  const [pinnedClosed, setPinnedClosed] = useStoredFlag(sidebarPinnedClosedKey(project.id));
  // チャットの右クリックメニュー（開く・名前を変更・アーカイブ・削除）
  const [rowMenu, setRowMenu] = useState<{ x: number; y: number; run: Run } | null>(null);

  // 自分で作ったグループ（作り始める入力欄と、グループごとの「…」メニュー・名前の変更・ドロップ先）
  const [creating, setCreating] = useState(false);
  const sections = useGroupSections({ projectId: project.id, groups, runs });
  // グループの開閉（グループごとに記憶）
  const groupClosed = useStoredFlagMap(SIDEBAR_GROUP_CLOSED_PREFIX);
  // 「グループなし」の開閉（プロジェクトごとに記憶。検索中は開いて見せる）
  const [ungroupedClosed, setUngroupedClosed] = useStoredFlag(sidebarUngroupedClosedKey(project.id));
  const toggleUngrouped = () => setUngroupedClosed(!ungroupedClosed);
  // 見出しの行の「すべて閉じる / 開く」: 中のまとまり（グループ・グループなし・固定・アーカイブ済み）もそろえる
  useFoldAll((closed) => {
    groups.forEach((g) => groupClosed.set(g.id, closed));
    setUngroupedClosed(closed);
    setPinnedClosed(closed);
    setArchivedOpen(!closed);
  });
  const startCreate = () => {
    if (collapsed) toggleCollapsed();
    setCreating(true);
  };

  // 右クリックメニューの「名前を変更」は、行の名前をその場で入力欄にする
  const rename = useRunRename((m) => void alertDialog("名前を変更できませんでした", m));
  const renderRow = ({ run, state }: { run: Run; state: AgentState }) => (
    <ChatRow
      key={run.id}
      run={run}
      state={state}
      active={route.name === "run" && route.runId === run.id}
      menuOpen={rowMenu?.run.id === run.id}
      onMenu={(at) => setRowMenu({ ...at, run })}
      onCloseMenu={() => setRowMenu(null)}
      onRename={() => rename.start(run)}
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
        counts={stateCounts(runs, pending)}
        stateFilter={stateFilter}
        onStateFilter={(next) => {
          setStateFilter(next);
          // 閉じているときに絞ったら、開いて見せる
          if (next && collapsed) toggleCollapsed();
        }}
        onCreateGroup={startCreate}
        headDrag={headDrag}
      />
      {/* チャット一覧（開閉で高さがなめらかに変わる） */}
      <Collapse open={!collapsed}>
        {allRows.length > 0 && <SearchField value={query} onChange={setQuery} placeholder="チャット名で検索" label={`${project.name} のチャットを検索`} />}
        {keyword && visibleRows.length === 0 && <p className="chat-search-empty">「{keyword}」に一致するチャットはありません</p>}
        {!keyword && stateFilter && visibleRows.length === 0 && <p className="chat-search-empty">{BOARD_COLUMN_LABELS[stateFilter]}のチャットはありません</p>}
        {creating && (
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
        {/* 送る前の新しいチャット（下書き）。絞り込んでいる間は出さない */}
        {!filtering && <DraftRows projectId={project.id} />}
        {pinnedRows.length > 0 && (
          <RowSection icon={Pin} label="固定" className="pinned" count={pinnedRows.length} open={!pinnedClosed || filtering} onToggle={() => setPinnedClosed(!pinnedClosed)}>
            <ul className="chat-rows">{pinnedRows.map(renderRow)}</ul>
          </RowSection>
        )}
        {groups.map((group) => {
          const members = list.groupedRows(group.id);
          // 検索中は、一致するチャットがないグループを隠す
          if (filtering && members.length === 0) return null;
          return (
            <CustomGroupSection
              key={group.id}
              projectId={project.id}
              group={group}
              members={members}
              closed={groupClosed.get(group.id) && !filtering}
              onSetClosed={(closed) => groupClosed.set(group.id, closed)}
              filtering={filtering}
              grouping={grouping}
              renderRow={renderRow}
              section={sections.sectionProps(group)}
            />
          );
        })}
        {groups.length > 0 && ungroupedRows.length > 0 && (
          <UngroupedHead projectId={project.id} count={ungroupedRows.length} open={!(ungroupedClosed && !filtering)} onToggle={toggleUngrouped} drop={sections.ungroupedDrop} />
        )}
        {(filtering && rows.length === 0) || (visibleRows.length === 0 && groups.length > 0 && ungroupedClosed && !filtering) ? null : visibleRows.length === 0 ? (
          <button className="chat-row ghost" onClick={() => openNewChat(project.id)}>
            <Plus size={13} /> 最初のチャットを始める
          </button>
        ) : ungroupedRows.length === 0 ? null : (
          // グループがあるときは「グループなし」の見出しで開閉し、中身を段下げする
          <Collapse open={!(groups.length > 0 && ungroupedClosed && !filtering)} indent={groups.length > 0}>
            {grouping === "recent" ? (
              <ul className="chat-rows" {...(groups.length > 0 ? sections.ungroupedDrop.props : {})}>
                {ungroupedRows.map(renderRow)}
              </ul>
            ) : (
              <GroupedChatRows grouping={grouping} projectId={project.id} rows={ungroupedRows} renderRow={renderRow} forceOpen={filtering} />
            )}
          </Collapse>
        )}
        {showArchived && !waitingOnly && archivedMatches.length > 0 && (
          <RowSection icon={Archive} label="アーカイブ済み" count={archivedMatches.length} open={archivedOpen || Boolean(keyword)} onToggle={toggleArchived}>
            {/* 中も、ほかのチャットと同じまとめ方で出す（開閉はアーカイブ済みの中だけで覚える） */}
            {grouping === "recent" ? (
              <ul className="chat-rows archived-rows">{archivedMatches.map(renderRow)}</ul>
            ) : (
              <div className="custom-group-grouped">
                <GroupedChatRows grouping={grouping} projectId={project.id} scope="archived" rows={archivedMatches} renderRow={renderRow} forceOpen={Boolean(keyword)} />
              </div>
            )}
          </RowSection>
        )}
      </Collapse>
      {sections.menuElement}
      {rowMenu && (
        <CardMenu
          {...rowMenu}
          onOpenPanel={(run) => openRun(run.project_id, run.id)}
          onRename={rename.start}
          onClose={() => setRowMenu(null)}
          onError={(m) => void alertDialog("操作できませんでした", m)}
          ignore=".chat-row-more"
        />
      )}
    </section>
  );
});
