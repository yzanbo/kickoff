import { useEffect, useState } from "react";
import type { Project } from "../../../../core/types";
import { api } from "../../api";
import { useSave } from "../../hooks/useSave";
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
        <label className="field">
          <span className="field-label">プロジェクト名</span>
          <input type="text" value={draft.name} maxLength={100} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        </label>
        <label className="field">
          <span className="field-label">概要・アイデア</span>
          <textarea rows={4} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
          <span className="field-help">最初の要件定義のチャットで、AI に渡す出発点になります。</span>
        </label>
        <label className="field">
          <span className="field-label">テストのコマンド</span>
          <input
            type="text"
            value={draft.test_command}
            placeholder="例: npm test"
            onChange={(e) => setDraft({ ...draft, test_command: e.target.value })}
          />
          <span className="field-help">テストのセクションで AI が実行します。空なら AI がリポジトリから判断します。</span>
        </label>
        <label className="field">
          <span className="field-label">デプロイの手順</span>
          <textarea
            rows={3}
            value={draft.deploy_instructions}
            placeholder="例: main に push すると Vercel に自動でデプロイされる"
            onChange={(e) => setDraft({ ...draft, deploy_instructions: e.target.value })}
          />
        </label>
        <SaveActions save={save} disabled={!dirty || !draft.name.trim()} onSave={() => api.updateProject(project.id, { ...draft, name: draft.name.trim() })} />
      </div>
    </section>
  );
}
