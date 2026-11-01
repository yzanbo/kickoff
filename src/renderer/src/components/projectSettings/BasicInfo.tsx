import { useEffect, useState } from "react";
import type { Project } from "../../../../core/types";
import { api } from "../../api";
import { useSave } from "../../hooks/useSave";
import { Field } from "../Field";
import { SaveActions } from "../SaveActions";

export function BasicInfo({ project }: { project: Project }) {
  const pick = (p: Project) => ({
    name: p.name,
    description: p.description,
    test_command: p.test_command,
    deploy_instructions: p.deploy_instructions,
  });
  const [draft, setDraft] = useState(() => pick(project));
  const save = useSave();
  // 別の画面で変わったときは追従する
  useEffect(() => setDraft(pick(project)), [project]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(pick(project));

  return (
    <section className="section">
      <h2>基本情報</h2>
      <div className="form">
        <Field label="プロジェクト名">
          <input type="text" value={draft.name} maxLength={100} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        </Field>
        <Field label="概要・アイデア" help="最初の要件定義のチャットで、AI に渡す出発点になります。">
          <textarea rows={4} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
        </Field>
        <Field label="テストのコマンド" help="テストのセクションで AI が実行します。空なら AI がリポジトリから判断します。">
          <input
            type="text"
            value={draft.test_command}
            placeholder="例: npm test"
            onChange={(e) => setDraft({ ...draft, test_command: e.target.value })}
          />
        </Field>
        <Field label="デプロイの手順">
          <textarea
            rows={3}
            value={draft.deploy_instructions}
            placeholder="例: main に push すると Vercel に自動でデプロイされる"
            onChange={(e) => setDraft({ ...draft, deploy_instructions: e.target.value })}
          />
        </Field>
        <SaveActions save={save} disabled={!dirty || !draft.name.trim()} onSave={() => api.updateProject(project.id, { ...draft, name: draft.name.trim() })} />
      </div>
    </section>
  );
}
