import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { PROJECT_HUES } from "@shared/project/colors";
import type { Project } from "@shared/types";
import { alertDialog } from "@/ui/dialogs";
import { errorMessage } from "@shared/errors";
import { api } from "@/api";
import { useSave } from "@/hooks/useSave";
import { Field } from "@/ui/Field";
import { SaveActions } from "@/ui/SaveActions";
import { changeProjectFolder } from "@/features/project/changeProjectFolder";
import { GIT_FEATURES, startProjectGit } from "@/features/project/GitInitNotice";
import { useGitStatus } from "@/features/editor/useGitStatus";
import { useMemoList } from "@/stores/memos";
import { FolderOverlapNotice } from "@/features/project/OverlapNotice";
import { MemoFolderField } from "@/features/memo/MemoFolderField";
import { TagEditor } from "./TagEditor";

export function BasicInfo({ project }: { project: Project }) {
  const pick = (p: Project) => ({ name: p.name, description: p.description });
  const [draft, setDraft] = useState(() => pick(project));
  const save = useSave();
  // 別の画面で変わったときは追従する
  useEffect(() => setDraft(pick(project)), [project]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(pick(project));

  return (
    <section className="section">
      <h2>基本情報</h2>
      <div className="form">
        {/* プロジェクト名と概要は、基本情報のいちばん上に置く（利用者の依頼。前はフォルダ・メモフォルダ・色・タグの下だった）。下の「保存」はこの 2 つだけのもの */}
        <Field label="プロジェクト名">
          <input type="text" value={draft.name} maxLength={100} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        </Field>
        {/* 概要の欄は、空なら 2 行の高さで、書いた分だけ伸ばす（field-sizing。利用者の依頼。前は空でも 4 行あった） */}
        <Field label="概要" help="このプロジェクトのチャットで、AI にプロジェクトの説明として渡します。">
          <textarea className="project-description" rows={2} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
        </Field>
        <SaveActions save={save} disabled={!dirty || !draft.name.trim()} onSave={() => api.updateProject(project.id, { ...draft, name: draft.name.trim() })} />
        <FolderRow project={project} />
        <MemoDirRow project={project} />
        <ColorField project={project} />
        <TagEditor project={project} />
      </div>
    </section>
  );
}

/**
 * メモフォルダ（利用者の依頼で、前は別の項目「メモ」で変えていたものを、ここでそのまま変える）。プロジェクトのフォルダとは別の場所で、フォルダを変えても変わらない。
 * ふだんは空欄（薄い文字でいまの場所 = アプリの設定の「メモ」の親フォルダの下の、このプロジェクトの名前のフォルダ）で、書く・選ぶとこのプロジェクトだけ別の場所にする。
 * ほかのプロジェクトとメモフォルダが同じなら、いつも知らせる（MemoFolderField）
 */
function MemoDirRow({ project }: { project: Project }) {
  const dir = useMemoList(project.id).data?.dir;
  return (
    <MemoFolderField
      label="メモフォルダ"
      help="「メモ」タブのメモを置くフォルダです。ふだんはアプリの設定の「メモ」で決めた親フォルダの下の、このプロジェクトの名前のフォルダで、書く・選ぶとこのプロジェクトだけ別の場所（チームで共有しているフォルダなど）にできます。変えても、いまあるメモは動かしません。プロジェクトフォルダを変えても変わりません。チャットで「メモ」「メモフォルダ」と言えば、AI はここのことだと分かります。"
      value={project.memo_path}
      fallback={project.memo_path ? "" : (dir ?? "")}
      onSave={(next) => api.updateProject(project.id, { memo_path: next })}
      overlapExcept={project.id}
    />
  );
}

/** プロジェクトの色（サイドバー・見出し・カンバンで使う）。一覧から選ぶと、すぐ変わる */
function ColorField({ project }: { project: Project }) {
  const choose = (hue: number) => void api.updateProject(project.id, { hue }).catch((e: unknown) => alertDialog("色を変えられませんでした", errorMessage(e)));
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
