import { ArrowDown, ArrowUp, MessageSquareQuote, Pencil, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import type { NewSnippetBody, Snippet } from "@shared/types";
import { moveWithin, snippetLabel, snippetsFor } from "@shared/snippet/snippets";
import { useAllSnippets } from "@/stores/snippets";
import { useProjects } from "@/stores/projects";
import { cx } from "@/lib/cx";
import { reportFailure } from "@/ui/dialogs";
import { EmptyState } from "@/ui/EmptyState";
import { IconButton } from "@/ui/IconButton";
import { confirmDeleteSnippet, createSnippet, reorderSnippets, scopeLabel, updateSnippet } from "./snippetActions";
import { SnippetForm, type SnippetScope } from "./SnippetForm";

/** 編集している行（新しく作るなら "new"） */
export type SnippetEditing = number | "new" | null;

/**
 * 定型文の一覧と編集（設定の「定型文」・プロジェクトの設定の「定型文」・チャット欄の帯の「定型文を管理」で共通）。
 * 一覧は 1 つで、projectId を渡すとそのプロジェクトで使うもの（共通とそのプロジェクトだけのもの）を出し、範囲は「共通 / このプロジェクト」から選ぶ。
 * null ならすべてを出し、範囲は共通とすべてのプロジェクトから選ぶ。↑↓ の並べ替えは、見えている中で隣と入れ替える（見えないものの位置は変えない）
 */
export function SnippetManager({ projectId, initialEditing = null }: { projectId: number | null; initialEditing?: SnippetEditing }) {
  const all = useAllSnippets();
  const { projects, projectName } = useProjects();
  const [editing, setEditing] = useState<SnippetEditing>(initialEditing);
  const shown = useMemo(() => (projectId === null ? all : snippetsFor(all, projectId)), [all, projectId]);
  const scopes: SnippetScope[] = useMemo(
    () =>
      projectId !== null
        ? [
            { value: null, label: "共通（すべてのプロジェクト）" },
            { value: projectId, label: "このプロジェクトだけ" },
          ]
        : [{ value: null, label: "共通（すべてのプロジェクト）" }, ...projects.filter((p) => !p.archived_at).map((p) => ({ value: p.id, label: p.name }))],
    [projectId, projects],
  );
  const nameOf = (id: number) => projectName(id) || undefined;
  const move = (id: number, delta: number) => {
    const ids = moveWithin(
      all.map((s) => s.id),
      shown.map((s) => s.id),
      id,
      delta,
    );
    if (ids) void reorderSnippets(ids).catch(reportFailure("並べ替えられませんでした"));
  };
  const save = async (snippet: Snippet | null, body: NewSnippetBody) => {
    if (snippet) await updateSnippet(snippet.id, body);
    else await createSnippet(body);
    setEditing(null);
  };
  // 新しく作るときの範囲は、プロジェクトの中ならこのプロジェクトだけ（そのプロジェクトのために作ることが多いため）、設定なら共通
  const blank: NewSnippetBody = {
    label: null,
    text: "",
    project_id: projectId,
  };
  return (
    <div className="snippet-manager">
      <div className="snippet-manager-head">
        <span className="muted small">
          {projectId === null ? `すべての定型文 ${all.length} 件` : `このプロジェクトで使う定型文 ${shown.length} 件（共通を含む）`}
        </span>
        <button type="button" className="btn" disabled={editing === "new"} onClick={() => setEditing("new")}>
          <Plus size={13} aria-hidden />
          定型文を追加
        </button>
      </div>
      {editing === "new" && (
        <SnippetForm initial={blank} scopes={scopes} saveLabel="追加" onSave={(body) => save(null, body)} onCancel={() => setEditing(null)} />
      )}
      {shown.length === 0 && editing !== "new" ? (
        <EmptyState
          icon={MessageSquareQuote}
          title="定型文はまだありません"
          className="snippet-empty"
          actions={
            <button type="button" className="btn btn-primary" onClick={() => setEditing("new")}>
              定型文を追加
            </button>
          }
        >
          よく送る指示を定型文にしておくと、チャット欄の中の帯から押すだけで入力欄に入れられます。共通にしたものは、すべてのプロジェクトで使えます。
        </EmptyState>
      ) : (
        <ul className="snippet-manager-list">
          {shown.map((s, i) =>
            editing === s.id ? (
              <li key={s.id}>
                <SnippetForm initial={s} scopes={scopes} saveLabel="保存" onSave={(body) => save(s, body)} onCancel={() => setEditing(null)} />
              </li>
            ) : (
              <li key={s.id} className="snippet-manager-row" onDoubleClick={() => setEditing(s.id)}>
                <div className="snippet-manager-moves">
                  <IconButton icon={ArrowUp} size={13} label="1 つ上へ" disabled={i === 0} onClick={() => move(s.id, -1)} />
                  <IconButton icon={ArrowDown} size={13} label="1 つ下へ" disabled={i === shown.length - 1} onClick={() => move(s.id, 1)} />
                </div>
                <div className="snippet-manager-body">
                  <div className="snippet-manager-title">
                    <span className="snippet-manager-name">{snippetLabel(s)}</span>
                    <span className={cx("snippet-scope", s.project_id === null && "common")}>{scopeLabel(s, nameOf, projectId)}</span>
                  </div>
                  <p className="snippet-manager-text">{s.text}</p>
                </div>
                <div className="snippet-manager-actions">
                  <IconButton icon={Pencil} size={13} label="編集" title="編集（ダブルクリックでも）" onClick={() => setEditing(s.id)} />
                  <IconButton icon={Trash2} size={13} label="削除" onClick={() => void confirmDeleteSnippet(s).catch(reportFailure("削除できませんでした"))} />
                </div>
              </li>
            ),
          )}
        </ul>
      )}
    </div>
  );
}
