import { useEffect, useState, type FormEvent } from "react";
import type { FolderInspection } from "@shared/types";
import { api } from "@/api";
import { errorMessage } from "@shared/errors";
import { useSubmit } from "@/hooks/useSubmit";
import { ErrorText } from "@/ui/ErrorText";
import { DialogActions } from "@/ui/DialogActions";
import { CheckField, Field } from "@/ui/Field";
import { FolderField } from "./FolderField";
import { InspectionPanel } from "./InspectionPanel";
import { gitInitChoice } from "@/features/project/gitInitChoice";
import type { FormProps } from "./NewProjectDialog";

export function ImportForm({ onCancel, onCreated }: FormProps) {
  const [folder, setFolder] = useState("");
  const [inspection, setInspection] = useState<FolderInspection>();
  const [inspecting, setInspecting] = useState(false);
  const [name, setName] = useState("");
  const [nameEdited, setNameEdited] = useState(false);
  const [description, setDescription] = useState("");
  const [initGit, setInitGit] = useState(false);
  const { submitting, error, setError, submit } = useSubmit();

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
    if (inspection && !nameEdited) setName(inspection.suggested_name);
  }, [inspection, nameEdited]);

  // git のリポジトリの中のフォルダも、そのまま取り込む（Git の操作はその中だけ。チェックすれば、このフォルダで別のリポジトリとして始める）
  const isSubfolder = Boolean(inspection?.is_git && inspection.git_root && inspection.git_root !== inspection.path);
  // git の管理を始めるかのチェック（git でない・コミットがない・リポジトリの中のフォルダ。初めはオフ）
  const gitChoice = inspection ? gitInitChoice(inspection) : null;
  const blocked = !inspection || !inspection.exists || !inspection.is_directory || Boolean(inspection.registered_project_id);

  const importProject = (e: FormEvent) => {
    e.preventDefault();
    if (!inspection) return;
    void submit(async () => onCreated(await api.importProject({ path: inspection.path, name, description, init_git: initGit })));
  };

  return (
    <form className="dialog-form" onSubmit={importProject}>
      <FolderField label="取り込むフォルダ" value={folder} onChange={setFolder} pickerTitle="取り込むフォルダを選択" autoFocus />

      {inspecting && <p className="muted small">フォルダを確認しています…</p>}
      {inspection && (
        <InspectionPanel info={inspection} isSubfolder={isSubfolder} />
      )}

      {gitChoice && <CheckField label={gitChoice.label} help={gitChoice.help(initGit)} checked={initGit} onChange={setInitGit} />}

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

      <DialogActions onCancel={onCancel} submit={{ label: "取り込む", busyLabel: "取り込み中…", busy: submitting, disabled: blocked || !name.trim() }} />
    </form>
  );
}
