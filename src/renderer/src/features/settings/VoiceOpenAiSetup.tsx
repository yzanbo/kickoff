import { useState } from "react";
import { OPENAI_TRANSCRIBE_MODELS, type AppSettings, type VoiceStatus } from "@shared/types";
import { cx } from "@/lib/cx";
import { isSubmitKey } from "@/lib/keys";
import { Field } from "@/ui/Field";
import { OpenAiKeyField } from "./OpenAiKeyField";
import { OPENAI_MODEL_INFO, OPENAI_PRICE_NOTE, perMinuteText } from "./voiceOptions";
import { VoiceStep } from "./VoiceStep";

const isListed = (model: string): model is (typeof OPENAI_TRANSCRIBE_MODELS)[number] => (OPENAI_TRANSCRIBE_MODELS as readonly string[]).includes(model);

/**
 * 「OpenAI」で文字起こしするときの準備: ① API キー（保存したら ✓）② モデル（料金の目安付きのカード）。
 * OpenAI 互換のサーバーを使うときの Base URL とほかのモデル名は「詳しい設定」に畳む（使っていればはじめから開く）
 */
export function VoiceOpenAiSetup({ status, draft, apply }: { status: VoiceStatus | undefined; draft: AppSettings; apply: (patch: Partial<AppSettings>) => void }) {
  const model = draft.voice_openai_model;
  const custom = !isListed(model);
  return (
    <Field as="div" label="OpenAI の準備">
      <ol className="voice-steps">
        <VoiceStep n={1} done={status?.openai.key_saved} title="API キーを保存する" badge={status?.openai.key_saved && <span className="badge">保存済み</span>}>
          <p className="field-help">
            OpenAI の API キーを入れます（ChatGPT の契約とは別の、API の利用料の支払いの設定が要ります）。
          </p>
          <OpenAiKeyField saved={status?.openai.key_saved} label={null} />
        </VoiceStep>
        <VoiceStep n={2} done={Boolean(model.trim())} title="モデルを選ぶ" badge={<span className="voice-price paid">有料（使った分だけ）</span>}>
          <div className="voice-models" role="radiogroup" aria-label="OpenAI のモデル">
            {OPENAI_TRANSCRIBE_MODELS.map((m) => {
              const info = OPENAI_MODEL_INFO[m];
              return (
                <label key={m} className={cx("voice-model", m === model && "selected")}>
                  <span className="voice-model-head">
                    <input type="radio" name="voice-openai-model" checked={m === model} onChange={() => apply({ voice_openai_model: m })} />
                    <span className="voice-model-name">{m}</span>
                    {info.recommended && <span className="badge voice-model-recommended">おすすめ</span>}
                    <span className="voice-model-price">{perMinuteText(info.perMinute)}</span>
                  </span>
                  <span className="field-help voice-model-note">{info.note}</span>
                </label>
              );
            })}
          </div>
          <p className="field-help">{OPENAI_PRICE_NOTE}</p>
        </VoiceStep>
      </ol>
      <details className="voice-advanced" open={custom || Boolean(draft.voice_openai_base_url) || undefined}>
        <summary>詳しい設定（OpenAI 互換のサーバーを使うとき）</summary>
        <Field label="Base URL" help="空なら https://api.openai.com/v1 です。入れたら欄の外を押す・Enter で保存します。">
          <CommitInput type="url" value={draft.voice_openai_base_url} placeholder="https://api.openai.com/v1" onCommit={(v) => apply({ voice_openai_base_url: v })} />
        </Field>
        <Field label="モデル名" help="上の一覧にないモデル（互換のサーバーのモデルなど）を使うときに入れます。">
          <CommitInput value={custom ? model : ""} placeholder="例: whisper-large-v3" onCommit={(v) => v && apply({ voice_openai_model: v })} />
        </Field>
      </details>
    </Field>
  );
}

/** 打つたびには保存せず、欄の外を押した・Enter で、変わっていれば保存する入力欄（前後の空白は除く） */
function CommitInput({ value, onCommit, ...rest }: { value: string; onCommit: (value: string) => void; type?: string; placeholder?: string }) {
  const [text, setText] = useState(value);
  const [base, setBase] = useState(value);
  // 保存した・ほかで変わった値に合わせ直す
  if (base !== value) {
    setBase(value);
    setText(value);
  }
  const commit = () => {
    const next = text.trim();
    if (next !== value) onCommit(next);
  };
  return (
    <input
      {...rest}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (!isSubmitKey(e)) return;
        e.preventDefault();
        commit();
      }}
    />
  );
}
