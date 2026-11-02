import { useEffect, useState } from "react";
import { PHASES, type Phase, type Project, type ProjectDefaults } from "../../../../core/types";
import { api } from "../../api";
import { useSave } from "../../hooks/useSave";
import { SECTION_META } from "../../sections";
import { Field } from "../Field";
import { SaveActions } from "../SaveActions";

export function ChatDefaults({ project }: { project: Project }) {
  const [section, setSection] = useState<Phase | "">(project.defaults.section ?? "");
  const save = useSave();
  useEffect(() => {
    setSection(project.defaults.section ?? "");
  }, [project.defaults]);
  const dirty = section !== (project.defaults.section ?? "");

  const submit = () => {
    // ほかの既定（AI の既定）は残したまま、セクションだけ置き換える
    const next: ProjectDefaults = { ...project.defaults };
    if (section) next.section = section;
    else delete next.section;
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
        <SaveActions save={save} disabled={!dirty} onSave={submit} />
      </div>
    </section>
  );
}
