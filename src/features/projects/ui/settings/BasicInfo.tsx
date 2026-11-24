import "./BasicInfo.css";
import type { CSSProperties } from "react";
import { PROJECT_HUES } from "@shared/projects/colors";
import type { Project } from "@shared/projects/types";
import { alert } from "@/foundation/ui/kit/ask";
import { errorMessage } from "@shared/foundation/errors";
import { projectsApi } from "@/features/projects/ui/api/projects";
import { CommitInput } from "@/foundation/ui/kit/CommitInput";
import { Field } from "@/foundation/ui/kit/Field";
import { changeProjectFolder } from "@/features/projects/ui/changeProjectFolder";
import { GIT_FEATURES, startProjectGit } from "@/features/projects/ui/GitInitNotice";
import { useProjectGitState } from "@/features/projects/ui/projectGit";
import { useWorkplace } from "@/foundation/ui/workplace/workplaceContext";
import { settingsItemsOf } from "@/features/settings/ui";
import { FolderOverlapNotice } from "@/features/projects/ui/OverlapNotice";
import { TagEditor } from "./TagEditor";
import { useEditedProject } from "./editedProject";

/** 基本情報（名前と概要・フォルダ・ほかの機能が足す欄（ノートのフォルダ）・色・タグ）。名前と概要は欄の外を押す・Enter で保存する */
export function BasicInfo() {
  const project = useEditedProject();
  const save = (patch: { name: string } | { description: string }) =>
    void projectsApi.updateProject(project.id, patch).catch((e: unknown) => alert("基本情報を保存できませんでした", errorMessage(e)));

  return (
    <section className="section">
      <h2>基本情報</h2>
      <div className="form">
        {/* プロジェクト名と概要は、基本情報のいちばん上に置く */}
        <Field label="プロジェクト名">
          <CommitInput type="text" value={project.name} maxLength={100} required onCommit={(name) => save({ name })} />
        </Field>
        {/* 概要の欄は、空なら 2 行の高さで、書いた分だけ伸ばす（field-sizing）。ないは null（空で保存するとコアが null にそろえる） */}
        <Field label="概要" help="このプロジェクトのチャットで、AI にプロジェクトの説明として渡します。">
          <CommitInput multiline className="project-description" rows={2} value={project.description ?? ""} onCommit={(description) => save({ description })} />
        </Field>
        <FolderRow project={project} />
        {settingsItemsOf("basic").map(({ id, Component }) => (
          <Component key={id} projectId={project.id} />
        ))}
        <ColorField project={project} />
        <TagEditor project={project} />
      </div>
    </section>
  );
}

/** プロジェクトの色（サイドバー・見出し・カンバンで使う）。一覧から選ぶと、すぐ変わる */
function ColorField({ project }: { project: Project }) {
  const choose = (hue: number) => void projectsApi.updateProject(project.id, { hue }).catch((e: unknown) => alert("色を変えられませんでした", errorMessage(e)));
  return (
    <Field label="色" help="サイドバー・見出し・全プロジェクトのカンバンで、このプロジェクトを見分ける色です。作ったときに、ほかと被らない色を選んでいます。">
      <div className="color-swatches" role="radiogroup" aria-label="プロジェクトの色">
        {PROJECT_HUES.map((hue) => (
          <button
            key={hue}
            type="button"
            role="radio"
            aria-checked={project.hue === hue}
            aria-label={`色 ${hue}°`}
            className="color-swatch"
            style={{ "--hue": `${hue}` } as CSSProperties}
            onClick={() => choose(hue)}
          />
        ))}
      </div>
    </Field>
  );
}

/** プロジェクトフォルダ（本体）。「変更…」で選び直す（確かめてから変える） */
function FolderRow({ project }: { project: Project }) {
  // git で管理していなければ、ここからも始められるようにする（ファイル・変更・履歴のタブと同じ）
  const git = useProjectGitState(useWorkplace(project.id));
  const { plain } = git;
  return (
    <Field
      as="div"
      label="プロジェクトフォルダ"
      help={
        <>
          AI が作業するフォルダです（チャットで「プロジェクトフォルダ」と言えば、AI はここのことだと分かります）。フォルダを移した・別の場所に置き直したときに選び直します。チャット・設定はそのまま引き継ぎ、次の指示から新しいフォルダで動きます。
          {plain && <>このフォルダは git で管理していません（{GIT_FEATURES}は使えません）。</>}
        </>
      }
    >
      <div className="input-row">
        <input type="text" aria-label="プロジェクトフォルダ" value={project.repo_path} readOnly />
        {window.kickoff && (
          <button type="button" className="btn" onClick={() => void changeProjectFolder(project)}>
            変更…
          </button>
        )}
        {plain && (
          <button type="button" className="btn" onClick={async () => {
              if (await startProjectGit(project.id)) git.refresh();
            }}>
            git の管理を始める…
          </button>
        )}
      </div>
      {/* ほかのプロジェクトとフォルダが被っていれば（同じ・その中・中にある）、いつも知らせる */}
      <FolderOverlapNotice path={project.repo_path} except={project.id} same="warn" />
    </Field>
  );
}
