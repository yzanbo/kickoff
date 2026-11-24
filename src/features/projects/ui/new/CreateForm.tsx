import { useEffect, useState, type FormEvent } from "react";
import { projectsApi } from "@/features/projects/ui/api/projects";
import { useAction } from "@/foundation/ui/hooks/useAction";
import { ErrorText } from "@/foundation/ui/kit/ErrorText";
import { DialogActions } from "@/foundation/ui/kit/DialogActions";
import { Field } from "@/foundation/ui/kit/Field";
import { useQuery } from "@/foundation/ui/query";
import { newProjectGitChoice } from "@/features/projects/ui/gitInitChoice";
import { GitInitField } from "@/features/projects/ui/GitInitField";
import { folderOverlaps } from "@/features/projects/ui/folderOverlaps";
import { FolderOverlapNotice } from "@/features/projects/ui/OverlapNotice";
import { useProjects } from "@/features/projects/ui/stores/projects";
import { FolderField } from "./FolderField";
import { noteDirBody, NoteDirField } from "./NoteDirField";
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
  // ノートの保存先を手で決めた場所（null なら保存先・フォルダ名から自動）
  const [noteDir, setNoteDir] = useState<string | null>(null);
  const { busy, error, run } = useAction<"submit">();
  const submitting = busy !== null;

  // フォルダ名を手で変えるまでは、名前から自動で提案する
  useEffect(() => {
    if (!folderEdited) setFolderName(suggestFolderName(name));
  }, [name, folderEdited]);

  // 保存先を点検する（入力中は少し待つ。届くまでは前の結果のまま、読めなければどちらもなし）。リポジトリの中なら、手で選ぶまでは git の管理を始めない（リポジトリの中にリポジトリを作らない）
  const parent = useQuery(["CreateForm.parent", parentDir], () => projectsApi.inspectWorkspace(parentDir), { delay: 300, keepPrevious: true });
  const parentInfo = parent.error ? undefined : parent.data;
  // 保存先が git のリポジトリの中ならその一番上（中に作ると、初めは親のリポジトリの中のフォルダにする）
  const parentRepo = parentInfo?.is_git ? parentInfo.git_root : null;
  // 保存先の実体のパス（リンクを解いたもの。ほかのプロジェクトのフォルダとの被りを比べる）
  const parentReal = parentInfo?.exists ? parentInfo.path : undefined;
  const gitChoice = newProjectGitChoice(parentRepo);
  useEffect(() => {
    if (!gitTouched) setInitGit(parentRepo === null);
  }, [parentRepo, gitTouched]);

  const create = (e: FormEvent) => {
    e.preventDefault();
    void run("submit", async () => onCreated(await projectsApi.createProject({ name, description: idea, parent_dir: parentDir, folder_name: folderName, init_git: initGit, ...noteDirBody(folderName, noteDir) })), { keepBusy: true });
  };

  const fullPath = `${parentDir.replace(/\/+$/, "")}/${folderName || "…"}`;
  // 作る場所がほかのプロジェクトのフォルダなら作れない（中・中にあるは知らせるだけ）
  const { projects } = useProjects();
  const realTarget = parentReal && folderName ? `${parentReal.replace(/\/+$/, "")}/${folderName}` : undefined;
  const taken = realTarget ? folderOverlaps(realTarget, projects).same.length > 0 : false;

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
        <FolderOverlapNotice path={realTarget} same="ng" />
      </Field>

      <NoteDirField base={folderName} custom={noteDir} onCustom={setNoteDir} />

      <GitInitField
        on={gitChoice.on}
        off={gitChoice.off}
        help={gitChoice.help(initGit)}
        value={initGit}
        onChange={(checked) => {
          setInitGit(checked);
          setGitTouched(true);
        }}
      />

      <ErrorText message={error} />

      <DialogActions onCancel={onCancel} submit={{ label: "作成", busyLabel: "作成中…", busy: submitting, disabled: !name.trim() || !folderName || taken }} />
    </form>
  );
}
