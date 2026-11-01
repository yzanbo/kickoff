import { Folder, FolderPlus, Globe, List, Plus, SquareKanban } from "lucide-react";
import { useEffect, useState, type DragEvent } from "react";
import { agentStateOf } from "../../../core/board";
import { AGENT_STATE_LABELS, type Approval, type Run, type RunGroup } from "../../../core/types";
import { api } from "../api";
import { droppedRunId, isRunDrag, startRunDrag, useGroupReorder } from "../groups";
import { useChatSearch } from "../chatSearch";
import { REOPEN_EVENT, type ReopenRoute } from "../router";
import { useGroupMenu } from "./GroupMenu";
import { InlineName } from "./InlineName";
import { BoardSearch, CardMenu, STATE_TONE } from "./KanbanBoard";
import { relativeTime } from "./RunList";
import { SectionBadge } from "./SectionBadge";
import { DraftCard, useSidePanel } from "./SidePanel";
import { confirmDialog } from "../dialogs";

interface Props {
  projectId: number;
  runs: Run[];
  groups: RunGroup[];
  approvals: Approval[];
  /** サイドバーのグループの＋から来たとき: そのグループで新しいチャットを始める */
  focus?: ReopenRoute;
  /** サイドバーのグループ名から来たとき: そのグループを表示して、背景を少しハイライトする */
  highlight?: number;
}

/**
 * 自分で作ったグループを管理するボード。列 = グループ、カード = チャット。
 * カードをドラッグしてグループを移し、列の見出しをドラッグしてグループを並べ替える。
 */
export function GroupBoard({ projectId, runs, groups, approvals, focus, highlight }: Props) {
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState<number>();
  const [dragRun, setDragRun] = useState<number>();
  /** ドラッグ中のものを重ねている列（グループの ID / "none" はグループなし） */
  const [over, setOver] = useState<number | "none">();
  const [error, setError] = useState<string>();
  const [menu, setMenu] = useState<{ x: number; y: number; run: Run } | null>(null);
  const [query, setQuery] = useState("");
  // ボード（列）/ リスト（縦に並べる）の切り替え。カンバンとは別に覚える
  const [view, setView] = useState<"board" | "list">(() => (localStorage.getItem("kickoff:group-view") === "list" ? "list" : "board"));
  useEffect(() => localStorage.setItem("kickoff:group-view", view), [view]);
  const search = useChatSearch(query);
  // カンバンと同じく、カードを押すと右側から出てくるパネルで開く
  const panel = useSidePanel({ runs, loaded: true, holdEsc: menu !== null });

  // サイドバーのグループの＋から来たら、そのグループで新しいチャットを右側に開く（同じ＋を押し直したときも）
  const openFocus = (target: ReopenRoute) => {
    if (target.name === "newChat") panel.openNew({ projectId, section: target.section, stage: target.stage, group: target.group });
  };
  const focusKey = focus ? JSON.stringify(focus) : "";
  useEffect(() => {
    if (focus) openFocus(focus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusKey]);
  useEffect(() => {
    const onReopen = (e: Event) => openFocus((e as CustomEvent<ReopenRoute>).detail);
    window.addEventListener(REOPEN_EVENT, onReopen);
    return () => window.removeEventListener(REOPEN_EVENT, onReopen);
  });
  /** その列（グループ）で入力中の新しいチャット */
  const draftsOf = (groupId: number | null) =>
    panel.drafts
      .filter((d) => d.target.projectId === projectId && (d.target.group ?? null) === groupId)
      .map((d) => (
        <DraftCard key={d.key} active={panel.isShowingTab(d.key)} onOpen={() => panel.showTab(d.key)} onDelete={() => panel.closeTab(d.key)} />
      ));

  // 目立たせるグループが見えるところまでスクロールする
  useEffect(() => {
    if (highlight === undefined) return;
    const timer = setTimeout(() => {
      document.querySelector(`[data-group-id="${highlight}"]`)?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    }, 50);
    return () => clearTimeout(timer);
  }, [highlight, view]);

  const groupIds = new Set(groups.map((g) => g.id));
  const membersOf = (groupId: number | null) =>
    runs
      .filter((r) => (groupId === null ? r.group_id === null || !groupIds.has(r.group_id) : r.group_id === groupId))
      .filter(search.matches)
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at));

  const guard = async (action: () => Promise<unknown>) => {
    try {
      await action();
      setError(undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const removeGroup = async (group: RunGroup) => {
    if (
      !(await confirmDialog({
        title: `グループ「${group.name}」を削除しますか？`,
        message: "中のチャットは消えず、グループなしに戻ります。",
        confirmLabel: "削除",
        danger: true,
      }))
    )
      return;
    void guard(() => api.deleteGroup(group.id));
  };
  // グループの「…」メニュー（右クリックでも開く）
  const groupMenu = useGroupMenu({ onRename: (g) => setRenaming(g.id), onDelete: (g) => void removeGroup(g) });

  /** 列をドロップ先にする。チャットはその列のグループへ、グループの列はその位置へ並べ替える */
  const reorder = useGroupReorder(
    groups.map((g) => g.id),
    (ids) => void guard(() => api.reorderGroups(projectId, ids)),
  );
  const dropProps = (groupId: number | null) => ({
    onDragOver: (e: DragEvent) => {
      if (reorder.over(e, groupId)) return;
      if (!isRunDrag(e)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setOver(groupId ?? "none");
    },
    onDragLeave: (e: DragEvent) => {
      if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
      setOver(undefined);
      reorder.leave(groupId);
    },
    onDrop: (e: DragEvent) => {
      setOver(undefined);
      if (reorder.drop(e, groupId)) return;
      e.preventDefault();
      const run = runs.find((r) => r.id === droppedRunId(e));
      if (run && run.group_id !== groupId) void guard(() => api.setRunGroup(run.id, groupId));
    },
  });

  /** カード・リストの行で共通: クリックで右側に開く、ドラッグでグループを移す、右クリックでメニュー */
  const cardProps = (run: Run) => ({
    draggable: true,
    role: "button",
    tabIndex: 0,
    "aria-label": `チャット「${run.title || "無題のチャット"}」を開く（ドラッグでグループを移す）`,
    onDragStart: (e: DragEvent) => {
      startRunDrag(e, run.id);
      setDragRun(run.id);
    },
    onDragEnd: () => setDragRun(undefined),
    onClick: () => panel.open(run),
    onKeyDown: (e: React.KeyboardEvent) => {
      if ((e.key === "Enter" || e.key === " ") && e.target === e.currentTarget) {
        e.preventDefault();
        panel.open(run);
      }
    },
    onContextMenu: (e: React.MouseEvent) => {
      e.preventDefault();
      setMenu({ x: e.clientX, y: e.clientY, run });
    },
  });
  const cardClass = (run: Run) =>
    `${dragRun === run.id ? "dragging" : ""} ${panel.isShowing(run.id) ? "selected" : ""} ${panel.hasTab(run.id) ? "in-tab" : ""}`;
  const stateOf = (run: Run) => agentStateOf(run, approvals.some((a) => a.run_id === run.id));

  const renderCard = (run: Run) => {
    const state = stateOf(run);
    return (
      <article key={run.id} className={`board-card ${cardClass(run)}`} {...cardProps(run)}>
        <span className="card-title">{run.title || "無題のチャット"}</span>
        <div className="card-labels">
          <SectionBadge section={run.phase} short />
        </div>
        <div className="card-foot">
          <span className="dot" style={{ background: STATE_TONE[state] }} />
          <span className="card-state">{AGENT_STATE_LABELS[state]}</span>
          <span className="card-time">{relativeTime(run.updated_at)}</span>
        </div>
      </article>
    );
  };

  const renderRow = (run: Run) => {
    const state = stateOf(run);
    return (
      <div key={run.id} className={`list-row ${cardClass(run)}`} {...cardProps(run)}>
        <div className="list-main">
          <span className="card-title one-line">{run.title || "無題のチャット"}</span>
            <span className="list-meta">
            <SectionBadge section={run.phase} short />
            <span className="dot" style={{ background: STATE_TONE[state] }} />
            <span className="muted small">{AGENT_STATE_LABELS[state]}</span>
          </span>
        </div>
        <span className="card-time">{relativeTime(run.updated_at)}</span>
      </div>
    );
  };

  /** グループの見出し（ボードの列・リストで共通）。group が null なら「グループなし」 */
  const renderHead = (group: RunGroup | null, count: number) => {
    if (!group) {
      return (
        <header className="column-head">
          <span className="column-title muted">グループなし</span>
          <span className="column-count">{count}</span>
          <span className="spacer" />
          <button className="icon-button" title="新しいチャット" aria-label="グループなしで新しいチャット" onClick={() => panel.openNew({ projectId })}>
            <Plus size={14} />
          </button>
        </header>
      );
    }
    return (
      <header
        className="column-head group-column-head"
        draggable={renaming !== group.id}
        title="ドラッグでグループを並べ替える（右クリックでメニュー）"
        onContextMenu={(e) => groupMenu.openFor(group, e)}
        {...reorder.handle(group.id)}
      >
        <Folder size={13} className="muted" aria-hidden />
        {renaming === group.id ? (
          <InlineName
            initial={group.name}
            onSubmit={(name) => {
              setRenaming(undefined);
              void guard(() => api.renameGroup(group.id, name));
            }}
            onCancel={() => setRenaming(undefined)}
          />
        ) : (
          <span className="column-title" onDoubleClick={() => setRenaming(group.id)}>
            {group.name}
          </span>
        )}
        {/* 名前の編集中は、ほかの操作を隠す */}
        {renaming !== group.id && (
          <>
            <span className="column-count">{count}</span>
            <button
              className="icon-button group-add-chat"
              title={`「${group.name}」に新しいチャット`}
              aria-label={`${group.name} に新しいチャット`}
              onClick={() => panel.openNew({ projectId, group: group.id })}
            >
              <Plus size={14} />
            </button>
            {groupMenu.button(group)}
          </>
        )}
      </header>
    );
  };

  const createForm = creating ? (
    <header className="column-head">
      <Folder size={13} className="muted" aria-hidden />
      <InlineName
        placeholder="グループ名（例: コードレビュー）"
        onSubmit={(name) => {
          setCreating(false);
          void guard(() => api.createGroup(projectId, name));
        }}
        onCancel={() => setCreating(false)}
      />
    </header>
  ) : (
    <button className="group-add" onClick={() => setCreating(true)}>
      <FolderPlus size={14} /> グループを作成
    </button>
  );

  const sections: (RunGroup | null)[] = [null, ...groups];
  const keyOf = (g: RunGroup | null) => g?.id ?? "none";
  const sectionClass = (g: RunGroup | null) =>
    `${over === (g?.id ?? "none") ? "drop-target" : ""} ${g ? reorder.classFor(g.id) : "ungrouped"} ${g && g.id === highlight ? "highlighted" : ""}`;
  const emptyText = (g: RunGroup | null) => (g ? "チャットをここへドラッグ" : "なし");

  return (
    <div className="board group-board">
      <div className="board-header">
        <Folder size={16} className="muted" />
        <span className="board-title">グループ</span>
        <span className="muted small">{groups.length} 件</span>
        {/* 操作のまとまり（狭いときは、まとめて次の行の右側へ） */}
        <div className="board-tools">
        <BoardSearch query={query} onChange={setQuery} />
        <button className="btn btn-sm" onClick={panel.openBrowser} title="開発中のアプリやドキュメントを右側で開く">
          <Globe size={13} /> <span className="btn-label">ブラウザ</span>
        </button>
        <button className="btn btn-sm" onClick={() => setCreating(true)}>
          <FolderPlus size={13} /> <span className="btn-label">グループを作成</span>
        </button>
        <button className="btn btn-sm" onClick={() => panel.openNew({ projectId })} title="右側で新しいチャットを始める">
          <Plus size={13} /> <span className="btn-label">新規</span>
        </button>
        <div className="board-tools-end">
        <div className="view-toggle" role="group" aria-label="表示の切り替え">
          <button className={view === "board" ? "active" : ""} aria-pressed={view === "board"} onClick={() => setView("board")}>
            <SquareKanban size={13} /> <span className="btn-label">ボード</span>
          </button>
          <button className={view === "list" ? "active" : ""} aria-pressed={view === "list"} onClick={() => setView("list")}>
            <List size={13} /> <span className="btn-label">リスト</span>
          </button>
        </div>
        {panel.toggleButton}
        </div>
        </div>
      </div>
      {error && <p className="error small board-error">{error}</p>}

      <div {...panel.body}>
        <div className="board-main">
          {view === "board" ? (
            <div className="board-columns">
              {sections.map((g) => {
                const members = membersOf(g?.id ?? null);
                return (
                  <section key={keyOf(g)} className={`board-column ${sectionClass(g)}`} data-group-id={g?.id} {...dropProps(g?.id ?? null)}>
                    {renderHead(g, members.length)}
                    <div className="column-cards">
                      {draftsOf(g?.id ?? null)}
                      {members.length === 0 && <p className="column-empty">{emptyText(g)}</p>}
                      {members.map(renderCard)}
                    </div>
                  </section>
                );
              })}
              <section className="board-column group-add-column">{createForm}</section>
            </div>
          ) : (
            <div className="board-list">
              {sections.map((g) => {
                const members = membersOf(g?.id ?? null);
                return (
                  <section key={keyOf(g)} className={`list-group ${sectionClass(g)}`} data-group-id={g?.id} {...dropProps(g?.id ?? null)}>
                    {renderHead(g, members.length)}
                    {draftsOf(g?.id ?? null)}
                    {members.length === 0 && <p className="column-empty">{emptyText(g)}</p>}
                    {members.map(renderRow)}
                  </section>
                );
              })}
              <section className="list-group group-add-row">{createForm}</section>
            </div>
          )}
        </div>
        {panel.renderPanel()}
      </div>

      {groupMenu.menu}
      {menu && <CardMenu {...menu} onOpenPanel={panel.open} onClose={() => setMenu(null)} onError={setError} />}
    </div>
  );
}
