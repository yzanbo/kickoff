import { useEffect, useState, type FormEvent } from "react";
import { api } from "@/api";
import { useSubmit } from "@/hooks/useSubmit";
import { ErrorText } from "@/ui/ErrorText";
import { DialogActions } from "@/ui/DialogActions";
import { CheckField, Field } from "@/ui/Field";
import { GIT_FEATURES } from "@/features/project/GitInitNotice";
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

export function CreateForm({ defaultParentDir, initialName = "", onCancel, onCreated }: FormProps & { defaultParentDir: string; initialName?: string }) {
  const [name, setName] = useState(initialName);
  const [idea, setIdea] = useState("");
  const [parentDir, setParentDir] = useState(defaultParentDir);
  const [folderName, setFolderName] = useState("");
  const [folderEdited, setFolderEdited] = useState(false);
  // git で管理するか（初めは管理する。しなければ README だけを置き、あとからファイル・変更・履歴のタブで始められる）
  const [initGit, setInitGit] = useState(true);
  const [gitTouched, setGitTouched] = useState(false);
  // 保存先が git のリポジトリの中ならその一番上（中に作ると、初めは親のリポジトリの中のフォルダにする）
  const [parentRepo, setParentRepo] = useState<string | null>(null);
  const { submitting, error, submit } = useSubmit();

  // フォルダ名を手で変えるまでは、名前から自動で提案する
  useEffect(() => {
    if (!folderEdited) setFolderName(suggestFolderName(name));
  }, [name, folderEdited]);

  // 保存先を点検する（入力中は少し待つ）。リポジトリの中なら、手で選ぶまでは git の管理を始めない（リポジトリの中にリポジトリを作らない）
  useEffect(() => {
    let alive = true;
    const timer = setTimeout(() => {
      api
        .inspectWorkspace(parentDir)
        .then((info) => alive && setParentRepo(info.is_git ? info.git_root : null))
        .catch(() => alive && setParentRepo(null));
    }, 300);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [parentDir]);
  useEffect(() => {
    if (!gitTouched) setInitGit(parentRepo === null);
  }, [parentRepo, gitTouched]);

  const create = (e: FormEvent) => {
    e.preventDefault();
    void submit(async () => onCreated(await api.createProject({ name, description: idea, parent_dir: parentDir, folder_name: folderName, init_git: initGit })));
  };

  const fullPath = `${parentDir.replace(/\/+$/, "")}/${folderName || "…"}`;

  return (
    <form className="dialog-form" onSubmit={create}>
      <Field label="プロジェクト名">
        <input type="text" value={name} autoFocus required maxLength={100} onChange={(e) => setName(e.target.value)} />
      </Field>

      <Field label="アイデア">
        <textarea
          rows={5}
          value={idea}
          placeholder="作りたいもの、困っていること、思いついたことを数行で。プロジェクトの概要として AI に伝わります。"
          onChange={(e) => setIdea(e.target.value)}
        />
      </Field>

      <FolderField label="保存先" value={parentDir} onChange={setParentDir} pickerTitle="保存先のフォルダを選択" />

      <Field label="フォルダ名" help={`${fullPath} に作成します（英数字・ハイフン・アンダースコア）。`}>
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

      <CheckField
        label={parentRepo ? "このフォルダで新しく git の管理を始める（親のリポジトリとは別のリポジトリにする）" : "git で管理する（リポジトリとして初期化し、README で最初のコミットを作る）"}
        help={
          parentRepo
            ? initGit
              ? `保存先は git のリポジトリ（${parentRepo}）の中です。新しいフォルダを別のリポジトリとして初期化します（親のリポジトリからは、別のリポジトリに見えます）。`
              : `保存先は git のリポジトリ（${parentRepo}）の中です。親のリポジトリの中のフォルダとして使います（変更・履歴・ワークツリーは、このフォルダの中だけ。コミットするまでワークツリーは作れません）。`
            : initGit
              ? `${GIT_FEATURES}が使えます。`
              : `git で管理しないと、${GIT_FEATURES}は使えません（あとから「git の管理を始める」で始められます）。`
        }
        checked={initGit}
        onChange={(checked) => {
          setInitGit(checked);
          setGitTouched(true);
        }}
      />

      <ErrorText message={error} />

      <DialogActions onCancel={onCancel} submit={{ label: "作成", busyLabel: "作成中…", busy: submitting, disabled: !name.trim() || !folderName }} />
    </form>
  );
}
