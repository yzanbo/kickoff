import { useEffect, useState, type FormEvent } from "react";
import type { FolderInspection } from "@shared/types";
import { api } from "@/api";
import { errorMessage } from "@shared/errors";
import { useSubmit } from "@/hooks/useSubmit";
import { ErrorText } from "@/ui/ErrorText";
import { DialogActions } from "@/ui/DialogActions";
import { Field } from "@/ui/Field";
import { FolderField } from "./FolderField";
import { InspectionPanel } from "./InspectionPanel";
import { memoDirBody, MemoDirField } from "./MemoDirField";
import { gitInitChoice, gitManagedNote } from "@/features/project/gitInitChoice";
import { GitInitField } from "@/features/project/GitInitField";
import type { FormProps } from "./NewProjectDialog";

export function ImportForm({ onCancel, onCreated }: FormProps) {
  const [folder, setFolder] = useState("");
  const [inspection, setInspection] = useState<FolderInspection>();
  const [inspecting, setInspecting] = useState(false);
  const [name, setName] = useState("");
  const [nameEdited, setNameEdited] = useState(false);
  const [description, setDescription] = useState("");
  const [initGit, setInitGit] = useState(false);
  // メモの保存先を手で決めた場所（null なら取り込むフォルダの名前から自動）
  const [memoDir, setMemoDir] = useState<string | null>(null);
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
  // git の管理を始めるかのボタン（git でない・コミットがない・リポジトリの中のフォルダ。初めは始めない）
  const gitChoice = inspection ? gitInitChoice(inspection) : null;
  const blocked = !inspection || !inspection.exists || !inspection.is_directory || Boolean(inspection.registered_project_id);
  // 自動で決めるメモのフォルダ名は、取り込むフォルダの名前
  const memoBase = !blocked ? (inspection.path.replace(/\/+$/, "").split("/").pop() ?? "") : "";

  const importProject = (e: FormEvent) => {
    e.preventDefault();
    if (!inspection) return;
    void submit(async () => onCreated(await api.importProject({ path: inspection.path, name, description, init_git: initGit, ...memoDirBody(memoBase, memoDir) })));
  };

  return (
    <form className="dialog-form" onSubmit={importProject}>
      <FolderField label="取り込むフォルダ" value={folder} onChange={setFolder} pickerTitle="取り込むフォルダを選択" autoFocus />

      {inspecting && <p className="muted small">フォルダを確認しています…</p>}
      {inspection && (
        <InspectionPanel info={inspection} isSubfolder={isSubfolder} />
      )}


      {/* git の管理: 始める / 始めない（初めは始めない）。もう git で管理されていれば、その旨だけ */}
      {inspection && !blocked && (gitChoice ? (
        <GitInitField on={gitChoice.on} off={gitChoice.off} value={initGit} onChange={setInitGit} help={gitChoice.help(initGit)} />
      ) : (
        <GitInitField on="" off="" value={false} onChange={setInitGit} managed={gitManagedNote(inspection)} />
      ))}

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

      {inspection && !blocked && <MemoDirField base={memoBase} custom={memoDir} onCustom={setMemoDir} />}

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
