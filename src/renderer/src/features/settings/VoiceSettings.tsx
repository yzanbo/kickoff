import { Mic } from "lucide-react";
import { VOICE_LANGUAGES, VOICE_PROVIDERS, type AppSettings, type VoiceStatus } from "@shared/types";
import { cx } from "@/lib/cx";
import { useSave } from "@/hooks/useSave";
import { useVoiceStatus } from "@/stores/voice";
import { Field } from "@/ui/Field";
import { ResultMessage } from "@/ui/SaveActions";
import { StatusDot } from "@/ui/StatusDot";
import { useSettingsDraft } from "./useSettingsDraft";
import { VOICE_PROVIDER_INFO } from "./voiceOptions";
import { VoiceLocalSetup } from "./VoiceLocalSetup";
import { VoiceOpenAiSetup } from "./VoiceOpenAiSetup";
import { VoiceProviderCard } from "./VoiceProviderCard";
import { VoiceSpeechSettings } from "./VoiceSpeechSettings";

/**
 * 設定: 音声入力（利用者の依頼で使いやすく作り直した）。上から、使うかのスイッチといま使えるか（1 枚のカード）→ 文字起こしの方法（無料 / 有料の札付きのカード）→
 * 話す言語 → 選んだ方法の準備（手順ごとに済んだら ✓）→ 音声モードの読み上げ（声の方法・声・速さ）。変えたらその場で保存する（保存のボタンを押し忘れて効かない、をなくす）
 */
export function VoiceSettings() {
  const { draft, setDraft, saveFields } = useSettingsDraft();
  const voice = useVoiceStatus();
  const save = useSave();
  if (!draft) return null;
  /** 変えた項目をすぐ保存する（下書きにも入れて、保存の応答を待たずに画面をそろえる） */
  const apply = (patch: Partial<AppSettings>) => {
    setDraft({ ...draft, ...patch });
    void save.run(() => saveFields(patch));
  };
  return (
    <section className="section voice-settings">
      <div className="voice-settings-head">
        <h2>音声入力</h2>
        <span className="voice-settings-saved small">
          <ResultMessage result={save.message} />
          {!save.message && <span className="muted">変えるとすぐ保存されます</span>}
        </span>
      </div>
      <VoiceHero status={voice.data} enabled={draft.voice_enabled} onToggle={(on) => apply({ voice_enabled: on })} />

      <Field as="div" label="文字起こしの方法">
        <div className="voice-providers" role="radiogroup" aria-label="文字起こしの方法">
          {VOICE_PROVIDERS.map((p) => (
            <VoiceProviderCard key={p} name="voice-provider" info={VOICE_PROVIDER_INFO[p]} selected={draft.voice_provider === p} onSelect={() => apply({ voice_provider: p })} />
          ))}
        </div>
      </Field>

      <Field label="話す言語" help="決まった言語で話すなら、選んでおくと正確になります。">
        <select className="voice-language" value={draft.voice_language} onChange={(e) => apply({ voice_language: e.target.value })}>
          {VOICE_LANGUAGES.map((l) => (
            <option key={l.value} value={l.value}>
              {l.label}
            </option>
          ))}
        </select>
      </Field>

      {draft.voice_provider === "local" ? (
        <VoiceLocalSetup voice={voice} model={draft.voice_model} onModel={(voiceModel) => apply({ voice_model: voiceModel })} />
      ) : (
        <VoiceOpenAiSetup status={voice.data} draft={draft} apply={apply} />
      )}

      <VoiceSpeechSettings status={voice.data} draft={draft} apply={apply} />
    </section>
  );
}

/** いちばん上のカード: 使うかのスイッチと、いま使えるか（使えなければ理由）・使い方 */
function VoiceHero({ status, enabled, onToggle }: { status: VoiceStatus | undefined; enabled: boolean; onToggle: (on: boolean) => void }) {
  const tone = status === undefined ? "pending" : status.ready ? "ok" : enabled ? "ng" : "na";
  const state = status === undefined ? "確認中…" : status.ready ? "使えます" : enabled ? "準備が必要です" : "オフ";
  return (
    <div className={cx("voice-hero", status?.ready && "ready")}>
      <span className="voice-hero-icon" aria-hidden>
        <Mic size={18} />
      </span>
      <div className="voice-hero-body">
        <label className="voice-hero-title">
          <span>チャット欄で音声入力を使う</span>
          <input type="checkbox" role="switch" className="voice-switch" checked={enabled} onChange={(e) => onToggle(e.target.checked)} />
        </label>
        <p className="voice-hero-state">
          <StatusDot tone={tone} />
          <b>{state}</b>
          {status && !status.ready && <span className="muted">— {enabled ? status.reason : "スイッチを入れると、マイクのボタンで話せるようになります。"}</span>}
        </p>
        <p className="field-help">
          チャット欄・AI からの質問の「その他」の欄のマイク（⌘⇧Space）を 1 回押して話し始め、話し終わったらもう一度押すと、文字になって入ります（押したまま話して離しても入ります）。
          チャット欄の波形のボタンは音声モードで、話し終わったら送るか入力欄に入れ、AI の返答を読み上げます。
        </p>
      </div>
    </div>
  );
}
