import { Folder, FolderPlus, Pencil, Trash2 } from "lucide-react";
import { useState, type DragEvent } from "react";
import { agentStateOf } from "../../../core/board";
import { AGENT_STATE_LABELS, type Approval, type Run, type RunGroup } from "../../../core/types";
import { api } from "../api";
import { droppedRunId, isRunDrag, startRunDrag } from "../groups";
import { navigate } from "../router";
import { InlineName } from "./InlineName";
import { STATE_TONE } from "./KanbanBoard";
import { relativeTime } from "./RunList";
import { SectionBadge } from "./SectionBadge";

/** グループの列をドラッグで並べ替えるときのデータの種類 */
const GROUP_DRAG_TYPE = "application/x-kickoff-group";

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

  const groupIds = new Set(groups.map((g) => g.id));
  const membersOf = (groupId: number | null) =>
    runs.filter((r) => (groupId === null ? r.group_id === null || !groupIds.has(r.group_id) : r.group_id === groupId));

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
  const dropProps = (groupId: number | null) => ({
    onDragOver: (e: DragEvent) => {
      const isGroup = e.dataTransfer.types.includes(GROUP_DRAG_TYPE);
      if (!isRunDrag(e) && !(isGroup && groupId !== null)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setOver(groupId ?? "none");
    },
    onDragLeave: (e: DragEvent) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(undefined);
    },
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      setOver(undefined);
      const movedGroup = Number(e.dataTransfer.getData(GROUP_DRAG_TYPE));
      if (movedGroup && groupId !== null) {
        if (movedGroup === groupId) return;
        const ids = groups.map((g) => g.id).filter((id) => id !== movedGroup);
        ids.splice(ids.indexOf(groupId), 0, movedGroup);
        void guard(() => api.reorderGroups(projectId, ids));
        return;
      }
      const run = runs.find((r) => r.id === droppedRunId(e));
      if (run && run.group_id !== groupId) void guard(() => api.setRunGroup(run.id, groupId));
    },
  });

  const renderCard = (run: Run) => {
    const state = agentStateOf(run, approvals.some((a) => a.run_id === run.id));
    return (
      <article
        key={run.id}
        className={`board-card ${dragRun === run.id ? "dragging" : ""}`}
        draggable
        tabIndex={0}
        title="クリックで開く・ドラッグでグループを移す"
        onDragStart={(e) => {
          startRunDrag(e, run.id);
          setDragRun(run.id);
        }}
        onDragEnd={() => setDragRun(undefined)}
        onClick={() => navigate({ name: "run", projectId, runId: run.id })}
        onKeyDown={(e) => e.key === "Enter" && navigate({ name: "run", projectId, runId: run.id })}
      >
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

  const ungrouped = membersOf(null);

  return (
    <div className="board group-board">
      <div className="board-header">
        <Folder size={16} className="muted" />
        <span className="board-title">グループ</span>
        <span className="muted small">{groups.length} 件</span>
        <span className="spacer" />
        <button className="btn btn-sm" onClick={() => setCreating(true)}>
          <FolderPlus size={13} /> グループを作成
        </button>
      </div>
      {error && <p className="error small board-error">{error}</p>}

      <div className="board-columns">
        <section className={`board-column ungrouped ${over === "none" ? "drop-target" : ""}`} {...dropProps(null)}>
          <header className="column-head">
            <span className="column-title muted">グループなし</span>
            <span className="column-count">{ungrouped.length}</span>
          </header>
          <div className="column-cards">
            {ungrouped.length === 0 && <p className="column-empty">なし</p>}
            {ungrouped.map(renderCard)}
          </div>
        </section>

        {groups.map((group) => {
          const members = membersOf(group.id);
          return (
            <section key={group.id} className={`board-column ${over === group.id ? "drop-target" : ""}`} {...dropProps(group.id)}>
              <header
                className="column-head group-column-head"
                draggable={renaming !== group.id}
                title="ドラッグでグループを並べ替える"
                onDragStart={(e) => {
                  e.dataTransfer.setData(GROUP_DRAG_TYPE, String(group.id));
                  e.dataTransfer.effectAllowed = "move";
                }}
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
                <span className="column-count">{members.length}</span>
                <button className="icon-button" title="名前を変更" aria-label={`${group.name} の名前を変更`} onClick={() => setRenaming(group.id)}>
                  <Pencil size={13} />
                </button>
                <button className="icon-button" title="グループを削除" aria-label={`${group.name} を削除`} onClick={() => removeGroup(group)}>
                  <Trash2 size={13} />
                </button>
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
  );
}
