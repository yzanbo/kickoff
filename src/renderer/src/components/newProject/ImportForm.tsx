import { useEffect, useState, type FormEvent } from "react";
import type { WorkspaceInspection } from "../../../../core/types";
import { api } from "../../api";
import { errorMessage } from "../../errors";
import { ErrorText } from "../ErrorText";
import { Field } from "../Field";
import { FolderField } from "./FolderField";
import { InspectionPanel } from "./InspectionPanel";
import type { FormProps } from "./NewProjectDialog";

export function ImportForm({ onCancel, onCreated }: FormProps) {
  const [folder, setFolder] = useState("");
  const [inspection, setInspection] = useState<WorkspaceInspection>();
  const [inspecting, setInspecting] = useState(false);
  const [name, setName] = useState("");
  const [nameEdited, setNameEdited] = useState(false);
  const [description, setDescription] = useState("");
  const [initGit, setInitGit] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();

  // フォルダが決まったら中身を点検する（入力中は少し待つ）
  useEffect(() => {
    setInspection(undefined);
    setInitGit(false);
    if (!folder.trim()) return;
    let alive = true;
    setInspecting(true);
    const timer = setTimeout(() => {
      api
        .inspectWorkspace(folder)
        .then((info) => alive && setInspection(info))
        .catch((e: unknown) => alive && setError(errorMessage(e)))
        .finally(() => alive && setInspecting(false));
    }, 300);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [folder]);

  useEffect(() => {
    if (inspection && !nameEdited) setName(inspection.suggestedName);
  }, [inspection, nameEdited]);

  const isSubfolder = Boolean(inspection?.isGit && inspection.gitRoot && inspection.gitRoot !== inspection.path);
  const needsInit = Boolean(inspection?.isDirectory && !isSubfolder && (!inspection.isGit || !inspection.hasCommits));
  const blocked =
    !inspection ||
    !inspection.exists ||
    !inspection.isDirectory ||
    isSubfolder ||
    Boolean(inspection.registered_project_id) ||
    (needsInit && !initGit);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!inspection) return;
    setSubmitting(true);
    setError(undefined);
    try {
      onCreated(
        await api.importProject({
          path: inspection.path,
          name,
          description,
          init_git: initGit,
        }),
      );
    } catch (err) {
      setError(errorMessage(err));
      setSubmitting(false);
    }
  }

  return (
    <form className="dialog-form" onSubmit={(e) => void submit(e)}>
      <FolderField label="取り込むフォルダ" value={folder} onChange={setFolder} pickerTitle="取り込むフォルダを選択" autoFocus />

      {inspecting && <p className="muted small">フォルダを確認しています…</p>}
      {inspection && (
        <InspectionPanel
          info={inspection}
          isSubfolder={isSubfolder}
          onUseRoot={() => inspection.gitRoot && setFolder(inspection.gitRoot)}
        />
      )}

      {needsInit && (
        <label className="check">
          <input type="checkbox" checked={initGit} onChange={(e) => setInitGit(e.target.checked)} />
          <span>
            {inspection?.isGit ? "既存のファイルで最初のコミットを作成する" : "git リポジトリとして初期化し、既存のファイルで最初のコミットを作成する"}
            <span className="field-help">
              フォルダ内のファイルがすべてコミットされます。秘密情報などがあれば、先に .gitignore に追加してください。
            </span>
          </span>
        </label>
      )}

      <Field label="プロジェクト名">
        <input
          type="text"
          value={name}
          required
          maxLength={100}
          onChange={(e) => {
            setName(e.target.value);
            setNameEdited(true);
          }}
        />
      </Field>

      <Field label="概要・やりたいこと（任意）">
        <textarea
          rows={3}
          value={description}
          placeholder="どんなアプリか、これから何をしたいか"
          onChange={(e) => setDescription(e.target.value)}
        />
      </Field>


      <ErrorText message={error} />

      <div className="dialog-actions">
        <button type="button" className="btn" onClick={onCancel}>
          キャンセル
        </button>
        <button type="submit" className="btn btn-primary" disabled={submitting || blocked || !name.trim()}>
          {submitting ? "取り込み中…" : "取り込む"}
        </button>
      </div>
    </form>
  );
}
