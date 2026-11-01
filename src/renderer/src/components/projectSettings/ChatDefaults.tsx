import { useEffect, useState } from "react";
import { BOARD_STAGE_LABELS, BOARD_STAGES, PHASES, type BoardStage, type Phase, type Project, type ProjectDefaults } from "../../../../core/types";
import { api } from "../../api";
import { useSave } from "../../hooks/useSave";
import { SECTION_META } from "../../sections";
import { Field } from "../Field";
import { SaveActions } from "../SaveActions";

export function ChatDefaults({ project }: { project: Project }) {
  const [section, setSection] = useState<Phase | "">(project.defaults.section ?? "");
  const [stage, setStage] = useState<BoardStage | "">(project.defaults.stage ?? "");
  const save = useSave();
  useEffect(() => {
    setSection(project.defaults.section ?? "");
    setStage(project.defaults.stage ?? "");
  }, [project.defaults]);
  const dirty = section !== (project.defaults.section ?? "") || stage !== (project.defaults.stage ?? "");

  const submit = () => {
    // ほかの既定（AI の既定）は残したまま、この 2 つだけ置き換える
    const next: ProjectDefaults = { ...project.defaults };
    if (section) next.section = section;
    else delete next.section;
    if (stage) next.stage = stage;
    else delete next.stage;
    return api.updateProject(project.id, { defaults: next });
  };

  return (
    <section className="section">
      <h2>新しいチャットの既定</h2>
      <div className="form">
        <Field label="セクション" help="新しいチャットの画面で、最初に選ばれているセクションです。">
          <select value={section} onChange={(e) => setSection(e.target.value as Phase | "")}>
            <option value="">直近のチャットと同じ（はじめは要件定義）</option>
            {PHASES.map((p) => (
              <option key={p} value={p}>
                {SECTION_META[p].label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="カンバンの列" help="カンバンの列の＋から作ったチャットは、その列に置かれます。">
          <select value={stage} onChange={(e) => setStage(e.target.value as BoardStage | "")}>
            <option value="">状態に合わせる（作業中は対応中、確認待ちはレビュー）</option>
            {BOARD_STAGES.map((s) => (
              <option key={s} value={s}>
                {BOARD_STAGE_LABELS[s]}
              </option>
            ))}
          </select>
        </Field>
        <SaveActions save={save} disabled={!dirty} onSave={submit} />
      </div>
    </section>
  );
}
