import { useEffect, useState } from "react";
import { PRE_COMPACT_PROMPT_MAX } from "@shared/chat/prompts";
import { api } from "@/api";
import { useSave } from "@/hooks/useSave";
import { useProjects } from "@/stores/projects";
import { settingsStore, useAppSettings } from "@/stores/settings";
import { Field } from "@/ui/Field";
import { SaveActions } from "@/ui/SaveActions";

/**
 * 圧縮前指示（会話を圧縮する前に AI に送る指示。圧縮で細かい内容が失われる前に、メモを残してもらうなど）。
 * projectId なしならアプリの設定の共通の指示、番号ならそのプロジェクトの指示（送るときは共通 → プロジェクトの順につなぐ）
 */
export function PreCompactPromptForm({ projectId }: { projectId: number | null }) {
  const settings = useAppSettings().data;
  const { projectsById } = useProjects();
  const saved = projectId === null ? settings?.pre_compact_prompt : projectsById.get(projectId)?.pre_compact_prompt;
  const [draft, setDraft] = useState(saved ?? "");
  const save = useSave();
  // 保存した・ほかで変わったときは追従する
  useEffect(() => setDraft(saved ?? ""), [saved]);
  const next = draft.trim() || null;
  const dirty = next !== (saved ?? null);

  const submit = async () => {
    if (projectId !== null) return api.updateProject(projectId, { pre_compact_prompt: next });
    settingsStore.set(await api.updateSettings({ pre_compact_prompt: next }));
  };

  return (
    <section className="section">
      <h2>圧縮前指示</h2>
      <p className="muted small">
        会話を圧縮する前に AI に送る指示です。圧縮すると会話の細かい内容は要約で失われるので、その前に残しておきたいことを頼めます。手で圧縮するとき（圧縮のボタン・送信待ちの圧縮の行）は先にこの指示を送り、その作業が終わってから圧縮します。上限に近づいた自動の圧縮でも、圧縮を待たせてこの指示を済ませてもらいます（残りが少なすぎるときは送らずに圧縮します）。
        {projectId === null ? "プロジェクトの設定にも指示があれば、この共通の指示のあとにつなげて送ります。" : "アプリの設定の「定型文」に共通の指示があれば、そのあとにこのプロジェクトの指示をつなげて送ります。"}
      </p>
      <div className="form">
        <Field label={projectId === null ? "すべてのプロジェクトの圧縮前指示" : "このプロジェクトの圧縮前指示"} help="空にすると送りません。送った指示は、会話に「圧縮前指示」の札付きの自分の発言として残ります。">
          <textarea rows={4} value={draft} maxLength={PRE_COMPACT_PROMPT_MAX} placeholder="例: いまの作業の進捗・決めたこと・次にやることを memo.md に書き残してください" onChange={(e) => setDraft(e.target.value)} />
        </Field>
        <SaveActions save={save} disabled={!dirty} onSave={submit} />
      </div>
    </section>
  );
}
