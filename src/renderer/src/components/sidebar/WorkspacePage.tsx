import { Archive, Folder, Pin, Plus } from "lucide-react";
import { memo, useState } from "react";
import { agentStateOf, boardColumnOf } from "../../../../core/board";
import { BOARD_COLUMN_LABELS, type AgentState, type Approval, type ProjectSummary, type Run, type RunGroup } from "../../../../core/types";
import { api } from "../../api";
import { useChatSearch } from "../../chatSearch";
import { alertDialog } from "../../dialogs";
import { confirmDeleteGroup, useGroupDrop } from "../../groups";
import { useRunRename } from "../../hooks/useRunRename";
import { useSharedChoice, useSharedFlag, useStoredFlag, useStoredFlagMap } from "../../hooks/useStoredState";
import { projectHue } from "../../projectColor";
import { openNewChat, openRun, type Route, routeProjectId } from "../../router";
import { CardMenu } from "../CardMenu";
import { useGroupMenu } from "../GroupMenu";
import { IconButton } from "../IconButton";
import { InlineName } from "../InlineName";
import { SearchField } from "../SearchField";
import { ChatRow } from "./ChatRow";
import { GroupToggle } from "./GroupToggle";
import { CHAT_GROUPINGS, type ChatGrouping } from "./chatGroupings";
import { GroupedChatRows } from "./GroupedChatRows";
import { CustomGroupSection } from "./CustomGroupSection";
import { DraftRows } from "./DraftRows";
import { RowSection } from "./RowSection";
import type { StateFilter } from "./HeadCounts";
import { GROUPING_KEY, isWaitingState, stateCounts, useFoldAll, useShowArchivedChats, WAITING_ONLY_KEY } from "./sidebarFlags";
import { WorkspaceHead } from "./WorkspaceHead";
import { cx } from "../../cx";
import { Collapse } from "../Collapse";


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
  searchAll = "",
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
  /** すべてのプロジェクトをまたぐ検索欄（縦並びの上）の検索語。プロジェクトの検索欄が空のときに使う */
  searchAll?: string;
}) {
  const [grouping] = useSharedChoice<ChatGrouping>(GROUPING_KEY, CHAT_GROUPINGS, "recent");
  // アーカイブ済みのチャットを一覧の下に出すか（どのプロジェクトでも同じ。はじめは出さない）
  const [showArchived] = useShowArchivedChats();
  // 自分待ち（回答待ち・確認待ち）だけを出すか（上の行の「自分待ち」で切り替える）
  const [waitingOnly] = useSharedFlag(WAITING_ONLY_KEY);
  // 見出しのクリックでチャット一覧を開閉する
  const toggleCollapsed = () => onCollapsedChange(project.id, !collapsed);
  // 選んでいる = いまの画面がこのプロジェクト（カンバン・チャットなど）
  const isActive = routeProjectId(route) === project.id;
  // プロジェクト内の検索: チャット名と、やり取りの中身（サーバーで全文検索）の両方で絞り込む
  const [query, setQuery] = useState("");
  const { keyword, matches } = useChatSearch(query || searchAll);
  // 見出しの状態の数を押して、その状態のチャットだけに絞る（このプロジェクトだけ。もう一度押すと戻す）
  const [stateFilter, setStateFilter] = useState<StateFilter | null>(null);
  // 検索・自分待ち・状態で絞り込んでいる間は、まとまりを開いて見せ、空のまとまりは隠す
  const filtering = Boolean(keyword) || waitingOnly || stateFilter !== null;

  const withState = (run: Run) => ({ run, state: agentStateOf(run, approvals.some((a) => a.run_id === run.id)) });
  const allRows = runs.filter((r) => !r.archived_at).map(withState);
  // アーカイブしたチャット（一覧の下にまとめて、開閉できる。最初は閉じておく）
  const archivedRows = runs.filter((r) => r.archived_at).map(withState);
  const [archivedOpen, setArchivedOpen] = useStoredFlag(`kickoff:archived-open:${project.id}`);
  const toggleArchived = () => setArchivedOpen(!archivedOpen);
  // チャットの右クリックメニュー（開く・名前を変更・アーカイブ・削除）
  const [rowMenu, setRowMenu] = useState<{ x: number; y: number; run: Run } | null>(null);
  const visibleRows = allRows.filter(
    ({ run, state }) => matches(run) && (!waitingOnly || isWaitingState(state)) && (stateFilter === null || boardColumnOf(state) === stateFilter),
  );
  // 上に固定したチャットは、グループ・グループなしから抜き出して、いちばん上にまとめる
  const pinnedRows = visibleRows.filter(({ run }) => run.pinned);
  const [pinnedClosed, setPinnedClosed] = useStoredFlag(`kickoff:pinned-closed:${project.id}`);
  const rows = visibleRows.filter(({ run }) => !run.pinned);
  const archivedMatches = archivedRows.filter(({ run }) => matches(run));

  // 自分で作ったグループ
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState<number>();
  // グループの開閉（グループごとに記憶）
  const groupClosed = useStoredFlagMap("kickoff:group-closed:");
  // 「グループなし」の開閉（プロジェクトごとに記憶。検索中は開いて見せる）
  const [ungroupedClosed, setUngroupedClosed] = useStoredFlag(`kickoff:ungrouped-closed:${project.id}`);
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
        counts={stateCounts(runs, approvals)}
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
          <RowSection icon={Pin} label="固定" count={pinnedRows.length} open={!pinnedClosed || filtering} onToggle={() => setPinnedClosed(!pinnedClosed)}>
            <ul className="chat-rows">{pinnedRows.map(renderRow)}</ul>
          </RowSection>
        )}
        {groups.map((group) => {
          const members = groupedRows(group.id);
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
              selected={route.name === "project" && route.id === project.id && route.tab === "groups" && route.group === group.id}
              filtering={filtering}
              grouping={grouping}
              renderRow={renderRow}
              renaming={renaming === group.id}
              onRenameStart={() => setRenaming(group.id)}
              onRenameEnd={() => setRenaming(undefined)}
              menu={groupMenu}
              dropClass={cx(dropOver === group.id && "drop-target", reorder.classFor(group.id))}
              dropProps={dropTarget(group.id)}
              dragProps={reorder.handle(group.id)}
            />
          );
        })}
        {groups.length > 0 && ungroupedRows.length > 0 && (
          <div className={`custom-group-head ungrouped ${dropOver === "none" ? "drop-target" : ""}`} {...dropTarget(null)}>
            <GroupToggle open={!(ungroupedClosed && !filtering)} onToggle={toggleUngrouped} />
            <button className="custom-group-name ungrouped-name" onClick={toggleUngrouped}>
              グループなし
            </button>
            <span className="custom-group-count">{ungroupedRows.length}</span>
            <IconButton icon={Plus} label="グループなしで新しいチャット" size={13} className="custom-group-add" onClick={() => openNewChat(project.id)} />
            {/* グループの見出しと＋の位置をそろえるため、右端の「…」の分を空けておく */}
            <span className="group-menu-spacer" aria-hidden />
          </div>
        )}
        {(filtering && rows.length === 0) || (visibleRows.length === 0 && groups.length > 0 && ungroupedClosed && !filtering) ? null : visibleRows.length === 0 ? (
          <button className="chat-row ghost" onClick={() => openNewChat(project.id)}>
            <Plus size={13} /> 最初のチャットを始める
          </button>
        ) : ungroupedRows.length === 0 ? null : (
          // グループがあるときは「グループなし」の見出しで開閉し、中身を段下げする
          <Collapse open={!(groups.length > 0 && ungroupedClosed && !filtering)} indent={groups.length > 0}>
            {grouping === "recent" ? (
              <ul className="chat-rows" {...(groups.length > 0 ? dropTarget(null) : {})}>
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
      {groupMenu.menu}
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
