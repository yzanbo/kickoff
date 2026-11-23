import "./ReferenceEditor.css";
import { FileText, Folder, FolderOpen, Plus, X } from "lucide-react";
import { useState } from "react";
import type { Project, ProjectReference } from "@shared/projects/types";
import { api } from "@/foundation/ui/api";
import { useAction } from "@/foundation/ui/hooks/useAction";
import { splitPath } from "@/foundation/ui/lib/format";
import { ErrorText } from "@/foundation/ui/kit/ErrorText";
import { IconButton } from "@/foundation/ui/kit/IconButton";
import { PathParts } from "@/foundation/ui/kit/PathParts";
import { canOpenExternal, openExternal } from "@/foundation/ui/external/native";
import { useEditedProject } from "./editedProject";

/** プロジェクトの設定の「参照資料」の節 */
export function ReferencesSection() {
  return (
    <section className="section">
      <h2>参照資料</h2>
      <p className="muted small">
        このプロジェクトのチャットで AI がいつでも読めるフォルダ・ファイルです。AI には一覧が伝わり、必要に応じて中身を読みます（書き込みはできません）。
      </p>
      <ReferenceEditor project={useEditedProject()} />
    </section>
  );
}

/**
 * 参照資料の一覧と追加・削除（AI がいつでも読めるフォルダ・ファイル）。
 * 変更はその場で保存する
 */
export function ReferenceEditor({ project }: { project: Project }) {
  const [typed, setTyped] = useState("");
  const { busy, error, run } = useAction<"save">();
  const saving = busy !== null;
  const refs = project.reference_paths;

  const save = (next: Pick<ProjectReference, "path">[]) => run("save", () => api.updateProject(project.id, { reference_paths: next }), { done: "保存しました" });

  const add = async (paths: string[]) => {
    const fresh = paths.map((p) => p.trim()).filter((p) => p && !refs.some((r) => r.path === p));
    if (fresh.length === 0) return;
    if (await save([...refs, ...fresh.map((path) => ({ path }))])) setTyped("");
  };

  const pick = async () => {
    const paths = (await window.kickoff?.dialog.pickReferences()) ?? [];
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
            const { name } = splitPath(r.path);
            const Icon = r.kind === "folder" ? Folder : FileText;
            return (
              <li key={r.path} className="reference-item">
                <Icon size={16} className={`reference-icon ${r.kind}`} aria-hidden />
                <span className="reference-text" title={r.path}>
                  <PathParts path={r.path} nameClass="reference-name" dirClass="reference-dir" suffix={r.kind === "folder" ? "/" : undefined} />
                </span>
                {canOpenExternal() && (
                  <IconButton
                    icon={FolderOpen}
                    label={`${name} を Finder で開く`}
                    title="Finder で開く"
                    onClick={() => void openExternal({ kind: "path", path: r.path })}
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
