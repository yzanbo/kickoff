import { OPENAI_TRANSCRIBE_MODELS, VOICE_LANGUAGES, type AppSettings, type VoiceProvider, type VoiceStatus } from "@shared/types";
import { useVoiceStatus, voiceStatusStore } from "@/stores/voice";
import { ErrorText } from "@/ui/ErrorText";
import { CheckField, Field } from "@/ui/Field";
import { RefreshButton } from "@/ui/IconButton";
import { SaveActions } from "@/ui/SaveActions";
import { Segmented } from "@/ui/Segmented";
import { StatusCard } from "@/ui/StatusCard";
import { OpenAiKeyField } from "./OpenAiKeyField";
import { useSettingsDraft } from "./useSettingsDraft";
import { VoiceModelList } from "./VoiceModelList";

/** OpenAI のモデルの候補の一覧の id（互換のサーバーでは、ほかの名前も入れられる） */
const OPENAI_MODEL_LIST_ID = "voice-openai-models";

/** 設定: チャット欄の音声入力（使うか・文字起こしの方法・言語・この Mac のモデル / OpenAI のキー） */
export function VoiceSettings() {
  const { draft, setDraft, dirty, save, saveFields } = useSettingsDraft();
  const voice = useVoiceStatus();
  const status = voice.data;
  if (!draft) return null;
  const set = (patch: Partial<AppSettings>) => setDraft({ ...draft, ...patch });
  return (
    <section className="section">
      <h2>音声入力</h2>
      <p className="muted small">
        チャット欄のマイクのボタン（⌘⇧Space）で話した内容を文字にして、入力欄に入れます。1 回押して話し始め、話し終わったらもう一度押してください。
      </p>
      <VoiceReadiness status={status} dirty={dirty} />
      <div className="form">
        <CheckField
          label="チャット欄で音声入力を使う"
          help="オフのときにマイクのボタンを押すと、この設定を開きます。"
          checked={draft.voice_enabled}
          onChange={(on) => set({ voice_enabled: on })}
        />
        <Field label="文字起こしの方法" help={draft.voice_provider === "local" ? "この Mac の中で文字にします（音声を外に送りません）。whisper.cpp とモデルが要ります。" : "OpenAI の API に音声を送って文字にします（API の料金がかかります）。"}>
          <Segmented<VoiceProvider>
            className="segmented"
            label="文字起こしの方法"
            value={draft.voice_provider}
            onChange={(voiceProvider) => set({ voice_provider: voiceProvider })}
            options={[
              { value: "local", label: "この Mac" },
              { value: "openai", label: "OpenAI" },
            ]}
          />
        </Field>
        <Field label="話す言語" help="決まった言語で話すなら、指定したほうが正確です。">
          <select value={draft.voice_language} onChange={(e) => set({ voice_language: e.target.value })}>
            {VOICE_LANGUAGES.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </select>
        </Field>
        {draft.voice_provider === "local" ? (
          <>
            <LocalTools status={status} checking={voice.loading} error={voice.error} />
            <Field as="div" label="モデル">
              <VoiceModelList models={status?.local.models} selected={draft.voice_model} onSelect={(voiceModel) => set({ voice_model: voiceModel })} />
            </Field>
          </>
        ) : (
          <>
            <OpenAiKeyField saved={status?.openai.key_saved} />
            <Field label="Base URL（任意）" help="OpenAI 互換のサーバーを使うときだけ入れます。空なら https://api.openai.com/v1 です。">
              <input type="url" value={draft.voice_openai_base_url} placeholder="https://api.openai.com/v1" onChange={(e) => set({ voice_openai_base_url: e.target.value })} />
            </Field>
            <Field label="モデル" help="gpt-4o-transcribe が正確です。gpt-4o-mini-transcribe は安く、whisper-1 は以前からのモデルです。">
              <input list={OPENAI_MODEL_LIST_ID} value={draft.voice_openai_model} onChange={(e) => set({ voice_openai_model: e.target.value })} />
              <datalist id={OPENAI_MODEL_LIST_ID}>
                {OPENAI_TRANSCRIBE_MODELS.map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
            </Field>
          </>
        )}
      </div>
      <SaveActions
        save={save}
        disabled={!dirty}
        onSave={() =>
          saveFields({
            voice_enabled: draft.voice_enabled,
            voice_provider: draft.voice_provider,
            voice_language: draft.voice_language,
            voice_model: draft.voice_model,
            voice_openai_base_url: draft.voice_openai_base_url.trim(),
            voice_openai_model: draft.voice_openai_model.trim(),
          })
        }
      />
    </section>
  );
}

/** いま使えるか（保存した設定で。使えなければ理由） */
function VoiceReadiness({ status, dirty }: { status: VoiceStatus | undefined; dirty: boolean }) {
  return (
    <div className="card-grid">
      <StatusCard
        title="音声入力"
        ok={status ? status.ready : undefined}
        detail={
          <>
            {status ? (status.ready ? "使えます。チャット欄のマイクのボタンから話せます。" : status.reason) : "確認中…"}
            {dirty && <span className="field-help"> 変更は保存してから効きます。</span>}
          </>
        }
      />
    </div>
  );
}

/** この Mac の whisper-cli・ffmpeg が見つかるか（なければ brew の案内）。checking は準備の状態を取り直している間 */
function LocalTools({ status, checking, error }: { status: VoiceStatus | undefined; checking: boolean; error: string | undefined }) {
  const tool = (path: string | null | undefined) => (status === undefined ? "確認中…" : path ?? "見つかりません");
  const missing = status && (!status.local.whisper || !status.local.ffmpeg);
  return (
    <Field
      as="div"
      labelClassName="voice-tools-head"
      label={
        <>
          この Mac の準備
          <RefreshButton label="もう一度確かめる" busy={checking} onClick={() => void voiceStatusStore.reload()} type="button" />
        </>
      }
      help={
        missing && (
          <>
            ターミナルで <code>brew install whisper-cpp ffmpeg</code> を実行してから、もう一度確かめてください。
          </>
        )
      }
    >
      <div className="card-grid voice-tools">
        <StatusCard title="whisper-cli（whisper.cpp）" ok={status ? Boolean(status.local.whisper) : undefined} detail={tool(status?.local.whisper)} />
        <StatusCard title="ffmpeg" ok={status ? Boolean(status.local.ffmpeg) : undefined} detail={tool(status?.local.ffmpeg)} />
      </div>
      <ErrorText message={error} />
    </Field>
  );
}
