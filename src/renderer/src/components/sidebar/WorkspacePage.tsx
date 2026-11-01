import { Archive, ChevronDown, ChevronRight, CircleAlert, CircleCheck, CircleDot, CircleX, Clock, Folder, FolderPlus, ListTree, Plus, Search, X } from "lucide-react";
import { memo, useCallback, useState } from "react";
import { agentStateOf } from "../../../../core/board";
import { AGENT_STATE_LABELS, AGENT_STATES, type AgentState, type Approval, type ProjectSummary, type Run, type RunGroup } from "../../../../core/types";
import { api } from "../../api";
import { useChatSearch } from "../../chatSearch";
import { chatTitle } from "../../chatTitle";
import { alertDialog } from "../../dialogs";
import { confirmDeleteGroup, startRunDrag, useGroupDrop } from "../../groups";
import { useStoredChoice, useStoredFlag } from "../../hooks/useStoredState";
import { initialOf, projectHue } from "../../projectColor";
import { href, navigate, openNewChat, openRun, type Route } from "../../router";
import { SECTION_META } from "../../sections";
import { relativeTime } from "../../time";
import { CardMenu } from "../CardMenu";
import { useGroupMenu } from "../GroupMenu";
import { GroupPickMenu } from "../GroupPickMenu";
import { InlineName } from "../InlineName";
import { StatusSlot } from "../StatusSlot";

type Grouping = "recent" | "status";
const GROUPING_KEY = "kickoff:sidebar-grouping";

/** ステータスでまとめるときの見出しのアイコン */
const GROUP_ICONS: Record<AgentState, typeof CircleAlert> = {
  needs_input: CircleAlert,
  failed: CircleX,
  attention: CircleCheck,
  running: CircleDot,
  done: CircleCheck,
};

// プロジェクトを切り替えても、中身の変わらないページは描き直さない
export const WorkspacePage = memo(function WorkspacePage({
  project,
  runs,
  groups,
  approvals,
  route,
  hidden,
  headDrag,
}: {
  project: ProjectSummary;
  runs: Run[];
  groups: RunGroup[];
  approvals: Approval[];
  route: Route;
  hidden: boolean;
  /** 縦並びのとき: 見出しのカードをつかんでプロジェクトを並べ替える */
  headDrag?: { onDragStart: (e: React.DragEvent) => void; onDragEnd: () => void };
}) {
  const [grouping, setGrouping] = useStoredChoice<Grouping>(GROUPING_KEY, ["recent", "status"], "recent");
  // 見出しのクリックでチャット一覧を開閉する（プロジェクトごとに記憶）
  const [collapsed, setCollapsed] = useStoredFlag(`kickoff:collapsed:${project.id}`);
  const toggleCollapsed = () => setCollapsed(!collapsed);
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

  // ＋を押したときの、作成先のグループを選ぶメニュー
  const [pickAt, setPickAt] = useState<{ x: number; y: number } | null>(null);
  const closePick = useCallback(() => setPickAt(null), []);
  // 自分で作ったグループ
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState<number>();
  // グループの開閉（グループごとに記憶。グループはあとから読み込まれるので、その都度 localStorage を見る）
  const [closedOverride, setClosedOverride] = useState<Record<number, boolean>>({});
  const isGroupClosed = (id: number) => closedOverride[id] ?? localStorage.getItem(`kickoff:group-closed:${id}`) === "1";
  // 「グループなし」の開閉（プロジェクトごとに記憶。検索中は開いて見せる）
  const [ungroupedClosed, setUngroupedClosed] = useStoredFlag(`kickoff:ungrouped-closed:${project.id}`);
  const toggleUngrouped = () => setUngroupedClosed(!ungroupedClosed);
  const toggleGroup = (id: number) => {
    const closed = !isGroupClosed(id);
    localStorage.setItem(`kickoff:group-closed:${id}`, closed ? "1" : "0");
    setClosedOverride((prev) => ({ ...prev, [id]: closed }));
  };
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

  const toggleGrouping = () => setGrouping(grouping === "recent" ? "status" : "recent");

  const renderRow = ({ run, state }: { run: Run; state: AgentState }) => {
    const meta = SECTION_META[run.phase];
    const Icon = meta.icon;
    const active = route.name === "run" && route.runId === run.id;
    return (
      <li key={run.id}>
        <a
          className={`chat-row ${run.archived_at ? "archived" : ""} ${active ? "active" : ""} ${state === "needs_input" || state === "attention" ? "is-unread" : ""}`}
          href={href({ name: "run", projectId: project.id, runId: run.id })}
          title={`${meta.label}: ${run.title}（${AGENT_STATE_LABELS[state]}）`}
          draggable
          onDragStart={(e) => startRunDrag(e, run.id)}
          onContextMenu={(e) => {
            e.preventDefault();
            setRowMenu({ x: e.clientX, y: e.clientY, run });
          }}
          onClick={(e) => {
            // 開いているチャットをもう一度押したときも、閉じたパネルを開き直す
            e.preventDefault();
            openRun(project.id, run.id);
          }}
        >
          <StatusSlot state={state} />
          <span className="chat-row-body">
            <span className="chat-row-line">
              <span className="chat-row-title">{chatTitle(run.title)}</span>
              <span className="chat-row-time">{relativeTime(run.updated_at)}</span>
            </span>
            <span className="chat-row-meta">
              <Icon size={11} className={`sec-icon sec-${run.phase}`} aria-hidden />
              {meta.label}
            </span>
          </span>
        </a>
      </li>
    );
  };

  return (
    <section
      className="workspace-page"
      data-project-id={project.id}
      aria-hidden={hidden}
      inert={hidden}
      style={{ "--ws-hue": `${projectHue(project.id)}` } as React.CSSProperties}
    >
      {/* どのプロジェクトを見ているかが一目でわかるよう、プロジェクトの色のカードにする */}
      <div
        className={`workspace-head ${isActive ? "active" : ""}`}
        draggable={Boolean(headDrag)}
        title={headDrag ? "ドラッグでプロジェクトを並べ替える" : undefined}
        {...headDrag}
      >
        {/* 左のボタン: チャット一覧の開閉 / 名前: プロジェクトのカンバンを表示 */}
        <button
          className="workspace-chevron"
          aria-expanded={!collapsed}
          aria-label={collapsed ? "チャット一覧を開く" : "チャット一覧を閉じる"}
          title={collapsed ? "チャット一覧を開く" : "チャット一覧を閉じる"}
          onClick={toggleCollapsed}
        >
          {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
        </button>
        <a className="workspace-title" href={href({ name: "project", id: project.id, tab: "board" })} title={`${project.name} のカンバンを開く`}>
          <span className="workspace-avatar" aria-hidden>
            {initialOf(project.name)}
          </span>
          <span className="workspace-title-text">
            <span className="workspace-name">{project.name}</span>
            <span className="workspace-sub">{allRows.length} チャット</span>
          </span>
        </a>
        {waitingCount > 0 && (
          <span className="count-badge" title="回答待ちのチャット" aria-label={`回答待ち ${waitingCount} 件`}>
            {waitingCount}
          </span>
        )}
        {!collapsed && (
          <button
            className="icon-button"
            title={grouping === "recent" ? "ステータスでまとめる" : "新しい順に並べる"}
            aria-label={grouping === "recent" ? "ステータスでまとめる" : "新しい順に並べる"}
            onClick={toggleGrouping}
          >
            {grouping === "recent" ? <ListTree size={14} /> : <Clock size={14} />}
          </button>
        )}
        <button className="icon-button" title="グループを作成" aria-label={`${project.name} にグループを作成`} onClick={startCreate}>
          <FolderPlus size={14} />
        </button>
        <button
          className="icon-button"
          title={groups.length > 0 ? "新しいチャット（作成先のグループを選ぶ）" : "新しいチャット（⌘N）"}
          aria-label={`${project.name} の新しいチャット`}
          aria-haspopup={groups.length > 0 ? "menu" : undefined}
          onClick={(e) => {
            // グループがあれば、どこに作るかを選んでもらう
            if (groups.length === 0) return openNewChat(project.id);
            const r = e.currentTarget.getBoundingClientRect();
            setPickAt({ x: r.left, y: r.bottom + 4 });
          }}
        >
          <Plus size={15} />
        </button>
      </div>
      {pickAt && (
        <GroupPickMenu
          x={pickAt.x}
          y={pickAt.y}
          groups={groups}
          onPick={(group) => openNewChat(project.id, group ? { group } : {})}
          onClose={closePick}
        />
      )}
      {!collapsed && allRows.length > 0 && (
        <div className="chat-search">
          <Search size={13} className="muted" aria-hidden />
          <input
            type="text"
            value={query}
            placeholder="チャット名で検索"
            aria-label={`${project.name} のチャットを検索`}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && setQuery("")}
          />
          {query && (
            <button className="chat-search-clear" aria-label="検索を解除" onClick={() => setQuery("")}>
              <X size={12} />
            </button>
          )}
        </div>
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
          const closed = isGroupClosed(group.id) && !keyword;
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
                <button
                  className="custom-group-toggle"
                  aria-expanded={!closed}
                  title={closed ? "開く" : "閉じる"}
                  onClick={() => toggleGroup(group.id)}
                >
                  {closed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                  <Folder size={13} aria-hidden />
                </button>
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
                    <button
                      className="icon-button custom-group-add"
                      title={`「${group.name}」に新しいチャット`}
                      aria-label={`${group.name} に新しいチャット`}
                      onClick={() => openNewChat(project.id, { group: group.id })}
                    >
                      <Plus size={13} />
                    </button>
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
          <button
            className="custom-group-toggle"
            aria-expanded={!(ungroupedClosed && !keyword)}
            title={ungroupedClosed ? "開く" : "閉じる"}
            onClick={toggleUngrouped}
          >
            {ungroupedClosed && !keyword ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
          </button>
          <button className="custom-group-name ungrouped-name" onClick={toggleUngrouped}>
            グループなし
          </button>
          <span className="custom-group-count">{ungroupedRows.length}</span>
          <button
            className="icon-button custom-group-add"
            title="グループなしで新しいチャット"
            aria-label="グループなしで新しいチャット"
            onClick={() => openNewChat(project.id)}
          >
            <Plus size={13} />
          </button>
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
        AGENT_STATES.map((state) => {
          const group = ungroupedRows.filter((r) => r.state === state);
          if (group.length === 0) return null;
          const Icon = GROUP_ICONS[state];
          return (
            <div key={state} className="status-group">
              <div className={`status-group-head state-${state}`}>
                <Icon size={14} />
                {AGENT_STATE_LABELS[state]}
              </div>
              <ul className="chat-rows">{group.map(renderRow)}</ul>
            </div>
          );
        })
      )}
      {!collapsed && archivedMatches.length > 0 && (
        <div className="archived-section">
          <div className="custom-group-head ungrouped">
            <button className="custom-group-toggle" aria-expanded={archivedOpen || Boolean(keyword)} onClick={toggleArchived}>
              {archivedOpen || keyword ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              <Archive size={12} aria-hidden />
            </button>
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
          onClose={() => setRowMenu(null)}
          onError={(m) => void alertDialog("操作できませんでした", m)}
        />
      )}
    </section>
  );
});
