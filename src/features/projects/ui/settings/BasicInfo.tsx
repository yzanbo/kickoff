import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { PROJECT_HUES } from "@shared/projects/colors";
import type { Project } from "@shared/projects/types";
import { alert } from "@/foundation/ui/kit/ask";
import { errorMessage } from "@shared/foundation/errors";
import { api } from "@/foundation/ui/api";
import { useSave } from "@/foundation/ui/hooks/useSave";
import { Field } from "@/foundation/ui/kit/Field";
import { SaveActions } from "@/foundation/ui/kit/SaveActions";
import { changeProjectFolder } from "@/features/projects/ui/changeProjectFolder";
import { GIT_FEATURES, startProjectGit } from "@/features/projects/ui/GitInitNotice";
import { useGitStatus } from "@/features/git/ui/useGitStatus";
import { useNoteList } from "@/features/notes/ui/stores/notes";
import { FolderOverlapNotice } from "@/features/projects/ui/OverlapNotice";
import { NoteFolderField } from "@/features/notes/ui/NoteFolderField";
import { TagEditor } from "./TagEditor";

export function BasicInfo({ project }: { project: Project }) {
  // 概要のないは null（欄は空。空で保存するとコアが null にそろえる）
  const pick = (p: Project) => ({ name: p.name, description: p.description ?? "" });
  const [draft, setDraft] = useState(() => pick(project));
  const save = useSave();
  // 別の画面で変わったときは追従する
  useEffect(() => setDraft(pick(project)), [project]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(pick(project));

  return (
    <section className="section">
      <h2>基本情報</h2>
      <div className="form">
        {/* プロジェクト名と概要は、基本情報のいちばん上に置く。下の「保存」はこの 2 つだけのもの */}
        <Field label="プロジェクト名">
          <input type="text" value={draft.name} maxLength={100} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        </Field>
        {/* 概要の欄は、空なら 2 行の高さで、書いた分だけ伸ばす（field-sizing） */}
        <Field label="概要" help="このプロジェクトのチャットで、AI にプロジェクトの説明として渡します。">
          <textarea className="project-description" rows={2} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
        </Field>
        <SaveActions save={save} disabled={!dirty || !draft.name.trim()} onSave={() => api.updateProject(project.id, { ...draft, name: draft.name.trim() })} />
        <FolderRow project={project} />
        <NoteDirRow project={project} />
        <ColorField project={project} />
        <TagEditor project={project} />
      </div>
    </section>
  );
}

/**
 * ノートフォルダ。プロジェクトのフォルダとは別の場所で、フォルダを変えても変わらない。
 * ふだんは空欄（薄い文字でいまの場所 = アプリの設定の「ノート」の親フォルダの下の、このプロジェクトの名前のフォルダ）で、書く・選ぶとこのプロジェクトだけ別の場所にする。
 * ほかのプロジェクトとノートフォルダが同じなら、いつも知らせる（NoteFolderField）
 */
function NoteDirRow({ project }: { project: Project }) {
  const dir = useNoteList(project.id).data?.dir;
  return (
    <NoteFolderField
      label="ノートフォルダ"
      help="「ノート」タブのノートを置くフォルダです。ふだんはアプリの設定の「ノート」で決めた親フォルダの下の、このプロジェクトの名前のフォルダで、書く・選ぶとこのプロジェクトだけ別の場所（チームで共有しているフォルダなど）にできます。変えても、いまあるノートは動かしません。プロジェクトフォルダを変えても変わりません。チャットで「ノート」「ノートフォルダ」と言えば、AI はここのことだと分かります。"
      value={project.note_dir}
      fallback={project.note_dir ? "" : (dir ?? "")}
      onSave={(next) => api.updateProject(project.id, { note_dir: next })}
      overlapExcept={project.id}
    />
  );
}

/** プロジェクトの色（サイドバー・見出し・カンバンで使う）。一覧から選ぶと、すぐ変わる */
function ColorField({ project }: { project: Project }) {
  const choose = (hue: number) => void api.updateProject(project.id, { hue }).catch((e: unknown) => alert("色を変えられませんでした", errorMessage(e)));
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
            style={{ "--ws-hue": `${hue}` } as CSSProperties}
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
  const git = useGitStatus(project.id, false);
  const plain = git.status?.repo === false;
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
              if (await startProjectGit(project.id)) void git.refresh();
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
