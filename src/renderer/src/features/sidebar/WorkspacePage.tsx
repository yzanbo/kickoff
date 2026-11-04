import { Archive, Folder, Pin, Plus } from "lucide-react";
import { memo, useState } from "react";
import { BOARD_COLUMN_LABELS, type AgentState, type ProjectSummary, type Run, type RunGroup } from "@shared/types";
import { api } from "@/api";
import { alertDialog } from "@/ui/dialogs";
import { useRunRename } from "@/features/chat/useChatRename";
import { useStoredFlag, useStoredFlagMap } from "@/hooks/useStoredState";
import { projectHue } from "@/features/project/projectColor";
import { SIDEBAR_GROUP_CLOSED_PREFIX, sidebarArchivedOpenKey, sidebarPinnedClosedKey, sidebarUngroupedClosedKey } from "@/lib/storageKeys";
import { openNewChat, openRun, routeProjectId, useRoute } from "@/app/router";
import { CardMenu } from "@/features/chat/ChatMenu";
import { InlineName } from "@/ui/InlineName";
import { SearchField } from "@/ui/SearchField";
import { ChatRow } from "./ChatRow";
import { useChatLayout } from "./chatGroupings";
import { GroupedChatRows } from "./GroupedChatRows";
import { CustomGroupSection } from "./CustomGroupSection";
import { useGroupSections } from "./useGroupSections";
import { DraftRows, useProjectDrafts } from "./DraftRows";
import { RowSection } from "@/ui/RowSection";
import { stateCounts } from "@/features/chat/chatState";
import { useFoldAll, useShowArchivedChats } from "@/features/chatList/chatListFlags";
import { UngroupedHead } from "./UngroupedHead";
import { useWorkspaceRows } from "./useWorkspaceRows";
import { WorkspaceHead } from "./WorkspaceHead";
import { Collapse } from "@/ui/Collapse";

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
  // まとめ方（まとめない / グループ / 作業場所）と並び順（新しい順 / 状態別）。グループの見出しは「グループ」のときだけ出す
  const { sections: chatSections, setSections, order } = useChatLayout();
  const byGroup = chatSections === "group";
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
  // 送る前の新しいチャット（下書き）。作成先のグループの中に、グループなしは「グループなし」の中に出す（グループの見出しがないときはいちばん上）。
  // 自分が続きを書くものなので「自分待ち」でも出す（検索・状態での絞り込み中は出さない）
  const drafts = useProjectDrafts(
    project.id,
    groups.map((g) => g.id),
  );
  const showDrafts = !keyword && stateFilter === null;
  // グループに入れた下書きがあれば、グループなしのチャットがなくても「グループなし」の見出しを出す（下書きを戻すドロップ先）
  const groupedDrafts = showDrafts && byGroup && groups.some((g) => drafts.inGroup(g.id).length > 0);
  // グループでまとめていないときは、グループに入れた下書きもいちばん上に並べる
  const topDrafts = byGroup ? drafts.top : [...drafts.top, ...groups.flatMap((g) => drafts.inGroup(g.id))];
  // グループの見出しを出しているか（グループでまとめていて、グループがあるとき）
  const showGroups = byGroup && groups.length > 0;
  // グループの見出しを出しているときは、どのグループにも入っていない下書きを「グループなし」の中（チャットの上）に並べる
  // （以前はプロジェクトのいちばん上に出していて、グループなしのものだと分かりにくかった）
  const ungroupedDrafts = showGroups && showDrafts ? drafts.top : [];
  // 見出しの下に並べる行: グループでまとめているときはグループなしのものだけ、それ以外はすべて（固定したものを除く）
  const mainRows = byGroup ? ungroupedRows : rows;
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
    // 作ったグループが見えるよう、グループでまとめる表示にする
    if (!byGroup) setSections("group");
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
        {/* グループの見出しを出していないときの下書き（グループでまとめていないときは、グループに入れたものも含めていちばん上に） */}
        {showDrafts && !showGroups && <DraftRows drafts={topDrafts} />}
        {pinnedRows.length > 0 && (
          <RowSection icon={Pin} label="固定" className="pinned" count={pinnedRows.length} open={!pinnedClosed || filtering} onToggle={() => setPinnedClosed(!pinnedClosed)}>
            <ul className="chat-rows">{pinnedRows.map(renderRow)}</ul>
          </RowSection>
        )}
        {byGroup && groups.map((group) => {
          const members = list.groupedRows(group.id);
          const groupDrafts = showDrafts ? drafts.inGroup(group.id) : [];
          // 検索・自分待ちなどで絞り込んでいる間は、一致するチャットがないグループを隠す（下書きがあれば出す。自分が続きを書くもの）
          if (filtering && members.length === 0 && groupDrafts.length === 0) return null;
          return (
            <CustomGroupSection
              key={group.id}
              projectId={project.id}
              group={group}
              members={members}
              closed={groupClosed.get(group.id) && !filtering}
              onSetClosed={(closed) => groupClosed.set(group.id, closed)}
              filtering={filtering}
              order={order}
              renderRow={renderRow}
              section={sections.sectionProps(group)}
              drafts={groupDrafts}
            />
          );
        })}
        {showGroups && (ungroupedRows.length > 0 || ungroupedDrafts.length > 0 || groupedDrafts) && (
          <UngroupedHead projectId={project.id} count={ungroupedRows.length} open={!(ungroupedClosed && !filtering)} onToggle={toggleUngrouped} drop={sections.ungroupedDrop} />
        )}
        {(filtering && rows.length === 0 && ungroupedDrafts.length === 0) ||
        (visibleRows.length === 0 && ungroupedDrafts.length === 0 && showGroups && ungroupedClosed && !filtering) ? null : visibleRows.length === 0 &&
          ungroupedDrafts.length === 0 ? (
          <button className="chat-row ghost" onClick={() => openNewChat(project.id)}>
            <Plus size={13} /> 最初のチャットを始める
          </button>
        ) : mainRows.length === 0 && ungroupedDrafts.length === 0 ? null : (
          // グループの見出しがあるときは「グループなし」の見出しで開閉し、中身（グループなしの下書き・チャット）を段下げする
          <Collapse open={!(showGroups && ungroupedClosed && !filtering)} indent={showGroups}>
            {/* グループなしの下書き（グループから戻すドロップ先にもする） */}
            <DraftRows drafts={ungroupedDrafts} drop={sections.ungroupedDrop.props} />
            {mainRows.length === 0 ? null : chatSections !== "worktree" && order === "recent" ? (
              <ul className="chat-rows" {...(showGroups ? sections.ungroupedDrop.props : {})}>
                {mainRows.map(renderRow)}
              </ul>
            ) : (
              <GroupedChatRows sections={chatSections === "worktree" ? "worktree" : "none"} order={order} projectId={project.id} rows={mainRows} renderRow={renderRow} forceOpen={filtering} />
            )}
          </Collapse>
        )}
        {showArchived && !waitingOnly && archivedMatches.length > 0 && (
          <RowSection icon={Archive} label="アーカイブ済み" count={archivedMatches.length} open={archivedOpen || Boolean(keyword)} onToggle={toggleArchived}>
            {/* 中も、ほかのチャットと同じまとめ方で出す（開閉はアーカイブ済みの中だけで覚える） */}
            {chatSections !== "worktree" && order === "recent" ? (
              <ul className="chat-rows archived-rows">{archivedMatches.map(renderRow)}</ul>
            ) : (
              <div className="custom-group-grouped">
                <GroupedChatRows
                  sections={chatSections === "worktree" ? "worktree" : "none"}
                  order={order}
                  projectId={project.id}
                  scope="archived"
                  rows={archivedMatches}
                  renderRow={renderRow}
                  forceOpen={Boolean(keyword)}
                />
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
