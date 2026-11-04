import { FileText, Folder, FolderOpen, Plus, X } from "lucide-react";
import { useState } from "react";
import type { Project, ProjectReference } from "@shared/types";
import { api } from "@/api";
import { useSave } from "@/hooks/useSave";
import { ErrorText } from "@/ui/ErrorText";
import { IconButton } from "@/ui/IconButton";

/** パスの最後の名前と、その親フォルダ（一覧で「名前」と「場所」を分けて見せる） */
function splitPath(p: string): { name: string; dir: string } {
  const i = p.lastIndexOf("/");
  return i < 0 ? { name: p, dir: "" } : { name: p.slice(i + 1) || p, dir: p.slice(0, i) || "/" };
}

/**
 * 参照資料の一覧と追加・削除（AI がいつでも読めるフォルダ・ファイル）。
 * 変更はその場で保存する
 */
export function ReferenceEditor({ project }: { project: Project }) {
  const [typed, setTyped] = useState("");
  const { saving, error, run } = useSave();
  const refs = project.reference_paths;

  const save = (next: Pick<ProjectReference, "path">[]) => run(() => api.updateProject(project.id, { reference_paths: next as ProjectReference[] }));

  const add = async (paths: string[]) => {
    const fresh = paths.map((p) => p.trim()).filter((p) => p && !refs.some((r) => r.path === p));
    if (fresh.length === 0) return;
    if (await save([...refs, ...fresh.map((path) => ({ path }))])) setTyped("");
  };

  const pick = async () => {
    const paths = (await window.kickoff?.pickReferences()) ?? [];
    await add(paths);
  };

  return (
    <div className="reference-editor">
      {refs.length === 0 ? (
        <div className="reference-empty">
          <p className="muted small">まだ参照資料はありません。仕様書・デザイン・別のリポジトリなど、AI に読んでほしいフォルダやファイルを追加してください。</p>
        </div>
      ) : (
        <ul className="reference-list">
          {refs.map((r) => {
            const { name, dir } = splitPath(r.path);
            const Icon = r.kind === "folder" ? Folder : FileText;
            return (
              <li key={r.path} className="reference-item">
                <Icon size={16} className={`reference-icon ${r.kind}`} aria-hidden />
                <span className="reference-text" title={r.path}>
                  <span className="reference-name">
                    {name}
                    {r.kind === "folder" && "/"}
                  </span>
                  <span className="reference-dir">{dir}</span>
                </span>
                {window.kickoff && (
                  <IconButton
                    icon={FolderOpen}
                    label={`${name} を Finder で開く`}
                    title="Finder で開く"
                    onClick={() => void window.kickoff?.openPath(r.path)}
                  />
                )}
                <IconButton
                  icon={X}
                  label={`${name} を参照資料から外す`}
                  title="参照資料から外す"
                  disabled={saving}
                  onClick={() => void save(refs.filter((x) => x.path !== r.path))}
                />
              </li>
            );
          })}
        </ul>
      )}

      <div className="reference-actions">
        {window.kickoff && (
          <button className="btn" disabled={saving} onClick={() => void pick()}>
            <Plus size={14} /> フォルダ・ファイルを追加
          </button>
        )}
        <form
          className="reference-typed"
          onSubmit={(e) => {
            e.preventDefault();
            void add([typed]);
          }}
        >
          <input
            type="text"
            value={typed}
            placeholder={window.kickoff ? "またはパスを入力（例: ~/Documents/spec）" : "パスを入力（例: ~/Documents/spec）"}
            aria-label="参照資料のパス"
            onChange={(e) => setTyped(e.target.value)}
          />
          <button className="btn" type="submit" disabled={saving || !typed.trim()}>
            追加
          </button>
        </form>
      </div>
      <ErrorText message={error} />
    </div>
  );
}
