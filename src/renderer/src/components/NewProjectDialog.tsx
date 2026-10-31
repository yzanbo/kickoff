import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import type { Project, WorkspaceInspection } from "../../../core/types";
import { api } from "../api";
import { href } from "../router";

interface Props {
  defaultParentDir: string;
  onClose: () => void;
  onCreated: (project: Project) => void;
}

type Mode = "create" | "import";

/** 新しいプロジェクト（新規作成 / 既存フォルダの取り込み） */
export function NewProjectDialog({ defaultParentDir, onClose, onCreated }: Props) {
  const [mode, setMode] = useState<Mode>("create");
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  const close = () => dialogRef.current?.close();

  return (
    <dialog ref={dialogRef} className="dialog" onClose={onClose}>
      <div className="dialog-body">
        <h2>新しいプロジェクト</h2>
        <div className="segmented" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "create"}
            className={mode === "create" ? "active" : ""}
            onClick={() => setMode("create")}
          >
            新しく作る
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "import"}
            className={mode === "import" ? "active" : ""}
            onClick={() => setMode("import")}
          >
            既存のフォルダを取り込む
          </button>
        </div>
        {mode === "create" ? (
          <CreateForm defaultParentDir={defaultParentDir} onCancel={close} onCreated={onCreated} />
        ) : (
          <ImportForm onCancel={close} onCreated={onCreated} />
        )}
      </div>
    </dialog>
  );
}

interface FormProps {
  onCancel: () => void;
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

function CreateForm({ defaultParentDir, onCancel, onCreated }: FormProps & { defaultParentDir: string }) {
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
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  }

  const fullPath = `${parentDir.replace(/\/+$/, "")}/${folderName || "…"}`;

  return (
    <form className="dialog-form" onSubmit={(e) => void submit(e)}>
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

      <FolderField label="保存先" value={parentDir} onChange={setParentDir} pickerTitle="保存先のフォルダを選択" />

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

function ImportForm({ onCancel, onCreated }: FormProps) {
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
        .catch((e: unknown) => alive && setError(e instanceof Error ? e.message : String(e)))
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
      setError(err instanceof Error ? err.message : String(err));
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

      <label className="field">
        <span className="field-label">プロジェクト名</span>
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
      </label>

      <label className="field">
        <span className="field-label">概要・やりたいこと（任意）</span>
        <textarea
          rows={3}
          value={description}
          placeholder="どんなアプリか、これから何をしたいか"
          onChange={(e) => setDescription(e.target.value)}
        />
      </label>


      {error && <p className="error">{error}</p>}

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

function InspectionPanel({
  info,
  isSubfolder,
  onUseRoot,
}: {
  info: WorkspaceInspection;
  isSubfolder: boolean;
  onUseRoot: () => void;
}) {
  const items: { kind: "ok" | "warn" | "ng" | "info"; text: ReactNode }[] = [];

  if (!info.exists) {
    items.push({ kind: "ng", text: "フォルダが見つかりません" });
  } else if (!info.isDirectory) {
    items.push({ kind: "ng", text: "フォルダではありません" });
  } else if (info.registered_project_id) {
    items.push({
      kind: "ng",
      text: (
        <>
          このフォルダはすでに登録されています（<a href={href({ name: "project", id: info.registered_project_id, tab: "chats" })}>開く</a>）
        </>
      ),
    });
  } else if (isSubfolder) {
    items.push({
      kind: "ng",
      text: (
        <>
          git リポジトリの一部です。ルート（{info.gitRoot}）を指定してください{" "}
          <button type="button" className="link-button accent" onClick={onUseRoot}>
            ルートを使う
          </button>
        </>
      ),
    });
  } else if (!info.isGit) {
    items.push({ kind: "warn", text: "git で管理されていません" });
  } else {
    items.push(
      info.hasCommits
        ? { kind: "ok", text: `git リポジトリ（ブランチ: ${info.branch ?? "不明"}）` }
        : { kind: "warn", text: "git リポジトリですが、コミットがまだありません" },
    );
    if (info.dirty) items.push({ kind: "info", text: "未コミットの変更があります（そのまま残ります）" });
    items.push(
      info.remoteUrl
        ? { kind: "ok", text: `remote: ${info.remoteUrl}` }
        : { kind: "info", text: "GitHub の remote（origin）が未設定です。PR を作るまでに設定してください" },
    );
  }

  return (
    <ul className="inspection">
      {items.map((item, i) => (
        <li key={i} className={`inspection-${item.kind}`}>
          <span className="inspection-icon" aria-hidden>
            {ICONS[item.kind]}
          </span>
          <span>{item.text}</span>
        </li>
      ))}
    </ul>
  );
}

const ICONS = { ok: "✓", warn: "⚠", ng: "✕", info: "ℹ" } as const;

function FolderField({
  label,
  value,
  onChange,
  pickerTitle,
  autoFocus,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  pickerTitle: string;
  autoFocus?: boolean;
}) {
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      <div className="input-row">
        <input
          type="text"
          aria-label={label}
          value={value}
          required
          autoFocus={autoFocus}
          placeholder="/Users/you/projects/my-app"
          onChange={(e) => onChange(e.target.value)}
        />
        {window.kickoff && (
          <button
            type="button"
            className="btn"
            onClick={async () => {
              const picked = await window.kickoff?.pickFolder(pickerTitle);
              if (picked) onChange(picked);
            }}
          >
            選択…
          </button>
        )}
      </div>
    </div>
  );
}
