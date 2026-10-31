import { useEffect, useRef, useState, type FormEvent } from "react";
import type { Project } from "../../../core/types";
import { api } from "../api";

interface Props {
  defaultParentDir: string;
  onClose: () => void;
  onCreated: (project: Project) => void;
}

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

export function NewProjectDialog({ defaultParentDir, onClose, onCreated }: Props) {
  const [name, setName] = useState("");
  const [idea, setIdea] = useState("");
  const [parentDir, setParentDir] = useState(defaultParentDir);
  const [folderName, setFolderName] = useState("");
  const [folderEdited, setFolderEdited] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  // フォルダ名を手で変えるまでは、名前から自動で提案する
  useEffect(() => {
    if (!folderEdited) setFolderName(suggestFolderName(name));
  }, [name, folderEdited]);

  async function pickFolder() {
    const picked = await window.kickoff?.pickFolder();
    if (picked) setParentDir(picked);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(undefined);
    try {
      onCreated(await api.createProject({ name, idea, parent_dir: parentDir, folder_name: folderName }));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  }

  const fullPath = `${parentDir.replace(/\/+$/, "")}/${folderName || "…"}`;

  return (
    <dialog ref={dialogRef} className="dialog" onClose={onClose}>
      <form className="dialog-body" onSubmit={(e) => void submit(e)}>
        <h2>新しいプロジェクト</h2>

        <label className="field">
          <span className="field-label">プロジェクト名</span>
          <input type="text" value={name} autoFocus required maxLength={100} onChange={(e) => setName(e.target.value)} />
        </label>

        <label className="field">
          <span className="field-label">アイデア</span>
          <textarea
            rows={5}
            value={idea}
            placeholder="作りたいもの、困っていること、思いついたことを数行で。要件定義で AI と詰めていきます。"
            onChange={(e) => setIdea(e.target.value)}
          />
        </label>

        <div className="field">
          <span className="field-label">保存先</span>
          <div className="input-row">
            <input
              type="text"
              aria-label="保存先"
              value={parentDir}
              required
              onChange={(e) => setParentDir(e.target.value)}
            />
            {window.kickoff && (
              <button type="button" className="btn" onClick={() => void pickFolder()}>
                選択…
              </button>
            )}
          </div>
        </div>

        <label className="field">
          <span className="field-label">フォルダ名</span>
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
          <span className="field-help">
            {fullPath} に作成し、git リポジトリとして初期化します（英数字・ハイフン・アンダースコア）。
          </span>
        </label>

        {error && <p className="error">{error}</p>}

        <div className="dialog-actions">
          <button type="button" className="btn" onClick={() => dialogRef.current?.close()}>
            キャンセル
          </button>
          <button type="submit" className="btn btn-primary" disabled={submitting || !name.trim() || !folderName}>
            {submitting ? "作成中…" : "作成"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
