import { COMPACT_PROMPT_MAX } from "@shared/chat/prompts";
import { Field } from "@/ui/Field";
import { SaveActions } from "@/ui/SaveActions";
import { Segmented } from "@/ui/Segmented";
import { COMPACT_PROMPT_KINDS, COMPACT_PROMPT_SWITCH } from "./compactPromptKinds";
import type { CompactPromptKind } from "@shared/chat/prompts";
import { useCompactPrompt } from "./useCompactPrompt";

/** 種類ごとの説明（何のための指示で、いつ送るか） */
const DESCRIPTIONS: Record<CompactPromptKind, string> = {
  pre: "会話を圧縮する前に AI に送る指示です。圧縮すると会話の細かい内容は要約で失われるので、その前に残しておきたいことを頼めます。手で圧縮するとき（圧縮のボタン・送信待ちの圧縮の行）は先にこの指示を送り、その作業が終わってから圧縮します。上限に近づいた自動の圧縮でも、圧縮を待たせてこの指示を済ませてもらいます（残りが少なすぎるときは送らずに圧縮します）。",
  post: "会話を圧縮したあとに AI に送る指示です。圧縮前指示で残したメモを読み直してもらうなど、要約になった会話の続きを始める前に頼めます。手で圧縮したときも自動の圧縮のときも、圧縮が終わったらまずこの指示を送ります。圧縮前指示の作業中・圧縮中に送った指示は、必ずこの指示のあとに伝えます。",
};

/**
 * 圧縮前指示・圧縮後指示（会話を圧縮する前・後に AI に送る指示）の欄。
 * projectId なしならアプリの設定の共通の指示、番号ならそのプロジェクトの指示（送るときは共通 → プロジェクトの順につなぐ）。
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
        {projectId === null ? "プロジェクトの設定にも指示があれば、この共通の指示のあとにつなげて送ります。" : "アプリの設定の「定型文」に共通の指示があれば、そのあとにこのプロジェクトの指示をつなげて送ります。"}
      </p>
      <div className="form">
        <Field as="div" label="送る" help="オフにすると、書いた文は残したまま送りません。">
          <Segmented<"on" | "off">
            className="segmented"
            label={`${label}を送る`}
            value={enabled ? "on" : "off"}
            options={COMPACT_PROMPT_SWITCH}
            onChange={(v) => setEnabled(v === "on")}
          />
        </Field>
        <Field label={projectId === null ? `すべてのプロジェクトの${label}` : `このプロジェクトの${label}`} help={`空にすると送りません。送った指示は、会話に「${label}」の札付きの自分の発言として残ります。`}>
          <textarea rows={4} value={draft} maxLength={COMPACT_PROMPT_MAX} placeholder={placeholder} onChange={(e) => setDraft(e.target.value)} />
        </Field>
        <SaveActions save={save} disabled={!dirty} onSave={submit} />
      </div>
    </section>
  );
}
