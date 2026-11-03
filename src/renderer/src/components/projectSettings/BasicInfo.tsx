import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { PROJECT_HUES } from "../../../../core/projectColors";
import type { Project } from "../../../../core/types";
import { alertDialog } from "../../dialogs";
import { errorMessage } from "../../errors";
import { api } from "../../api";
import { useSave } from "../../hooks/useSave";
import { Field } from "../Field";
import { SaveActions } from "../SaveActions";
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
        <ColorField project={project} />
        <TagEditor project={project} />
        <Field label="プロジェクト名">
          <input type="text" value={draft.name} maxLength={100} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        </Field>
        <Field label="概要・アイデア" help="このプロジェクトのチャットで、AI にプロジェクトの説明として渡します。">
          <textarea rows={4} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
        </Field>
        <SaveActions save={save} disabled={!dirty || !draft.name.trim()} onSave={() => api.updateProject(project.id, { ...draft, name: draft.name.trim() })} />
      </div>
    </section>
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
