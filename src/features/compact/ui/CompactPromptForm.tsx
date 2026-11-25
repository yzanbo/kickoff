import { COMPACT_PROMPT_MAX } from "@shared/projects/types";
import { Field } from "@/foundation/ui/kit/Field";
import { SaveActions } from "@/foundation/ui/kit/SaveActions";
import { ChoiceField } from "@/foundation/ui/kit/ChoiceField";
import { COMPACT_PROMPT_KINDS, COMPACT_PROMPT_SWITCH } from "./compactPromptKinds";
import type { CompactPromptKind } from "@shared/chat/prompts";
import { useCompactPrompt } from "./useCompactPrompt";

/** 種類ごとの説明（何のための指示で、いつ送るか） */
const DESCRIPTIONS: Record<CompactPromptKind, string> = {
  pre: "会話を圧縮する前に AI に送る指示です。圧縮すると会話の細かい内容は要約で失われるので、その前に残しておきたいことを頼めます。手で圧縮するとき（圧縮のボタン・送信待ちの圧縮の行）は先にこの指示を送り、その作業が終わってから圧縮します。上限に近づいた自動の圧縮でも、圧縮を待たせてこの指示を済ませてもらいます（残りが少なすぎるときは送らずに圧縮します）。",
  post: "会話を圧縮したあとに AI に送る指示です。圧縮前指示で残したノートを読み直してもらうなど、要約になった会話の続きを始める前に頼めます。手で圧縮したときも自動の圧縮のときも、圧縮が終わったらまずこの指示を送ります。圧縮前指示の作業中・圧縮中に送った指示は、必ずこの指示のあとに伝えます。",
};

/**
 * 圧縮前指示・圧縮後指示（会話を圧縮する前・後に AI に送る指示）の欄。
 * projectId なしならアプリの設定のすべてのプロジェクトの指示、番号ならそのプロジェクトの指示（送るときはすべて → プロジェクトの順につなぐ）。
 * 文の上のオン / オフは、押したらすぐ保存する（オフでも文は残し、送らないだけ。文の保存は下の「保存」）
 */
export function CompactPromptForm({ kind, projectId }: { kind: CompactPromptKind; projectId: number | null }) {
  const { enabled, setEnabled, draft, setDraft, dirty, save, submit } = useCompactPrompt(kind, projectId);
  const { label, placeholder } = COMPACT_PROMPT_KINDS[kind];

  return (
    <section className="section">
      <h2>{label}</h2>
      <p className="muted small">
        {DESCRIPTIONS[kind]}
        {projectId === null ? "プロジェクト（共通も）の設定にも指示があれば、このすべてのプロジェクトの指示のあとにつなげて送ります。" : "アプリの設定の「圧縮前・圧縮後指示」にすべてのプロジェクトの指示があれば、そのあとにここの指示をつなげて送ります。"}
      </p>
      <div className="form">
        <ChoiceField<"on" | "off">
          label="送る"
          groupLabel={`${label}を送る`}
          help="オフにすると、書いた文は残したまま送りません。"
          value={enabled ? "on" : "off"}
          options={COMPACT_PROMPT_SWITCH}
          onChange={(v) => setEnabled(v === "on")}
        />
        <Field label={projectId === null ? `すべてのプロジェクトの${label}` : `このプロジェクトの${label}`} help={`空にすると送りません。送った指示は、会話に「${label}」の札付きの自分の発言として残ります。`}>
          <textarea rows={4} value={draft} maxLength={COMPACT_PROMPT_MAX} placeholder={placeholder} onChange={(e) => setDraft(e.target.value)} />
        </Field>
        <SaveActions save={save} disabled={!dirty} onSave={submit} />
      </div>
    </section>
  );
}
