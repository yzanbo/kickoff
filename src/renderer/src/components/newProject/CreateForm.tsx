import { useEffect, useState, type FormEvent } from "react";
import { api } from "../../api";
import { errorMessage } from "../../errors";
import { ErrorText } from "../ErrorText";
import { Field } from "../Field";
import { FolderField } from "./FolderField";
import type { FormProps } from "./NewProjectDialog";

/** 英数字だけのフォルダ名を名前から作る（日本語だけの名前なら空になるので手入力してもらう） */
function suggestFolderName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9._-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "");
}

export function CreateForm({ defaultParentDir, onCancel, onCreated }: FormProps & { defaultParentDir: string }) {
  const [name, setName] = useState("");
  const [idea, setIdea] = useState("");
  const [parentDir, setParentDir] = useState(defaultParentDir);
  const [folderName, setFolderName] = useState("");
  const [folderEdited, setFolderEdited] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();

  // フォルダ名を手で変えるまでは、名前から自動で提案する
  useEffect(() => {
    if (!folderEdited) setFolderName(suggestFolderName(name));
  }, [name, folderEdited]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(undefined);
    try {
      onCreated(await api.createProject({ name, idea, parent_dir: parentDir, folder_name: folderName }));
    } catch (err) {
      setError(errorMessage(err));
      setSubmitting(false);
    }
  }

  const fullPath = `${parentDir.replace(/\/+$/, "")}/${folderName || "…"}`;

  return (
    <form className="dialog-form" onSubmit={(e) => void submit(e)}>
      <Field label="プロジェクト名">
        <input type="text" value={name} autoFocus required maxLength={100} onChange={(e) => setName(e.target.value)} />
      </Field>

      <Field label="アイデア">
        <textarea
          rows={5}
          value={idea}
          placeholder="作りたいもの、困っていること、思いついたことを数行で。要件定義で AI と詰めていきます。"
          onChange={(e) => setIdea(e.target.value)}
        />
      </Field>

      <FolderField label="保存先" value={parentDir} onChange={setParentDir} pickerTitle="保存先のフォルダを選択" />

      <Field label="フォルダ名" help={`${fullPath} に作成し、git リポジトリとして初期化します（英数字・ハイフン・アンダースコア）。`}>
        <input
          type="text"
          value={folderName}
          required
          pattern="[A-Za-z0-9._\-]+"
          placeholder="my-app"
          onChange={(e) => {
            setFolderName(e.target.value);
            setFolderEdited(true);
          }}
        />
      </Field>

      <ErrorText message={error} />

      <div className="dialog-actions">
        <button type="button" className="btn" onClick={onCancel}>
          キャンセル
        </button>
        <button type="submit" className="btn btn-primary" disabled={submitting || !name.trim() || !folderName}>
          {submitting ? "作成中…" : "作成"}
        </button>
      </div>
    </form>
  );
}
