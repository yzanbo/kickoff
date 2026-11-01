import { Folder, FolderPlus, Globe, Pencil, Plus, Trash2 } from "lucide-react";
import { useState, type DragEvent } from "react";
import { agentStateOf } from "../../../core/board";
import { AGENT_STATE_LABELS, type Approval, type Run, type RunGroup } from "../../../core/types";
import { api } from "../api";
import { droppedRunId, isRunDrag, startRunDrag, useGroupReorder } from "../groups";
import { useChatSearch } from "../chatSearch";
import { navigate } from "../router";
import { InlineName } from "./InlineName";
import { BoardSearch, CardMenu, CardSnippet, STATE_TONE } from "./KanbanBoard";
import { relativeTime } from "./RunList";
import { SectionBadge } from "./SectionBadge";
import { useSidePanel } from "./SidePanel";

interface Props {
  projectId: number;
  runs: Run[];
  groups: RunGroup[];
  approvals: Approval[];
}

/**
 * 自分で作ったグループを管理するボード。列 = グループ、カード = チャット。
 * カードをドラッグしてグループを移し、列の見出しをドラッグしてグループを並べ替える。
 */
export function GroupBoard({ projectId, runs, groups, approvals }: Props) {
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState<number>();
  const [dragRun, setDragRun] = useState<number>();
  /** ドラッグ中のものを重ねている列（グループの ID / "none" はグループなし） */
  const [over, setOver] = useState<number | "none">();
  const [error, setError] = useState<string>();
  const [menu, setMenu] = useState<{ x: number; y: number; run: Run } | null>(null);
  const [query, setQuery] = useState("");
  const search = useChatSearch(query, projectId);
  // カンバンと同じく、カードを押すと右側から出てくるパネルで開く
  const panel = useSidePanel({ runs, loaded: true, holdEsc: menu !== null });

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

  const removeGroup = (group: RunGroup) => {
    if (!confirm(`グループ「${group.name}」を削除しますか？\n中のチャットは消えず、グループなしに戻ります。`)) return;
    void guard(() => api.deleteGroup(group.id));
  };

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

  const renderCard = (run: Run) => {
    const state = agentStateOf(run, approvals.some((a) => a.run_id === run.id));
    return (
      <article
        key={run.id}
        className={`board-card ${dragRun === run.id ? "dragging" : ""} ${panel.isShowing(run.id) ? "selected" : ""} ${panel.hasTab(run.id) ? "in-tab" : ""}`}
        draggable
        role="button"
        tabIndex={0}
        aria-label={`チャット「${run.title || "無題のチャット"}」を開く（ドラッグでグループを移す）`}
        onDragStart={(e) => {
          startRunDrag(e, run.id);
          setDragRun(run.id);
        }}
        onDragEnd={() => setDragRun(undefined)}
        onClick={() => panel.open(run)}
        onKeyDown={(e) => {
          if ((e.key === "Enter" || e.key === " ") && e.target === e.currentTarget) {
            e.preventDefault();
            panel.open(run);
          }
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          setMenu({ x: e.clientX, y: e.clientY, run });
        }}
      >
        <span className="card-title">{run.title || "無題のチャット"}</span>
        <CardSnippet hit={search.snippetFor(run)} />
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

  const ungrouped = membersOf(null);

  return (
    <div className="board group-board">
      <div className="board-header">
        <Folder size={16} className="muted" />
        <span className="board-title">グループ</span>
        <span className="muted small">{groups.length} 件</span>
        <span className="spacer" />
        <BoardSearch query={query} onChange={setQuery} />
        <button className="btn btn-sm" onClick={panel.openBrowser} title="開発中のアプリやドキュメントを右側で開く">
          <Globe size={13} /> ブラウザ
        </button>
        <button className="btn btn-sm" onClick={() => setCreating(true)}>
          <FolderPlus size={13} /> グループを作成
        </button>
      </div>
      {error && <p className="error small board-error">{error}</p>}

      <div {...panel.body}>
      <div className="board-main">
      <div className="board-columns">
        <section className={`board-column ungrouped ${over === "none" ? "drop-target" : ""}`} {...dropProps(null)}>
          <header className="column-head">
            <span className="column-title muted">グループなし</span>
            <span className="column-count">{ungrouped.length}</span>
            <span className="spacer" />
            <button className="icon-button" title="新しいチャット" aria-label="グループなしで新しいチャット" onClick={() => navigate({ name: "newChat", projectId })}>
              <Plus size={14} />
            </button>
          </header>
          <div className="column-cards">
            {ungrouped.length === 0 && <p className="column-empty">なし</p>}
            {ungrouped.map(renderCard)}
          </div>
        </section>

        {groups.map((group) => {
          const members = membersOf(group.id);
          return (
            <section
              key={group.id}
              className={`board-column ${over === group.id ? "drop-target" : ""} ${reorder.classFor(group.id)}`}
              {...dropProps(group.id)}
            >
              <header
                className="column-head group-column-head"
                draggable={renaming !== group.id}
                title="ドラッグでグループを並べ替える"
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
                {renaming !== group.id && (
                  <>
                    <span className="column-count">{members.length}</span>
                    <button className="icon-button" title="名前を変更" aria-label={`${group.name} の名前を変更`} onClick={() => setRenaming(group.id)}>
                      <Pencil size={13} />
                    </button>
                    <button className="icon-button" title="グループを削除" aria-label={`${group.name} を削除`} onClick={() => removeGroup(group)}>
                      <Trash2 size={13} />
                    </button>
                    <button
                      className="icon-button group-add-chat"
                      title={`「${group.name}」に新しいチャット`}
                      aria-label={`${group.name} に新しいチャット`}
                      onClick={() => navigate({ name: "newChat", projectId, group: group.id })}
                    >
                      <Plus size={14} />
                    </button>
                  </>
                )}
              </header>
              <div className="column-cards">
                {members.length === 0 && <p className="column-empty">チャットをここへドラッグ</p>}
                {members.map(renderCard)}
              </div>
            </section>
          );
        })}

        <section className="board-column group-add-column">
          {creating ? (
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
          )}
        </section>
      </div>
      </div>
      {panel.renderPanel()}
      </div>

      {menu && <CardMenu {...menu} onOpenPanel={panel.open} onClose={() => setMenu(null)} onError={setError} />}
    </div>
  );
}
