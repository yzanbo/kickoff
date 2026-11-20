import { useEffect, useRef, useState } from "react";
import { Square, Volume2 } from "lucide-react";
import type { AppSettings } from "@shared/foundation/contract/settings";
import { OPENAI_TTS_VOICES, VOICE_TTS_PROVIDERS, type VoiceStatus } from "@shared/voice/types";
import { useLatest } from "@/foundation/ui/hooks/useLatest";
import { useWindowEvent } from "@/foundation/ui/hooks/useWindowEvent";
import { ErrorText } from "@/foundation/ui/kit/ErrorText";
import { Field } from "@/foundation/ui/kit/Field";
import { Speaker, systemVoices } from "@/features/voice/ui/speaker";
import { OpenAiKeyField } from "./OpenAiKeyField";
import { VOICE_TTS_PROVIDER_INFO, VOICE_TTS_RATES } from "./voiceOptions";
import { VoiceProviderCard } from "./VoiceProviderCard";

/** 試しに読む文（話す言語が英語なら英語） */
const sampleText = (language: string) => (language === "en" ? "Hello. I will read the AI's replies in this voice." : "こんにちは。この声で AI の返答を読み上げます。");

/** この Mac の声の一覧（Chromium は声の一覧をあとから読み込むので、届いたら読み直す） */
function useSystemVoices(language: string) {
  const [voices, setVoices] = useState(() => systemVoices(language));
  useEffect(() => {
    const reload = () => setVoices(systemVoices(language));
    reload();
    speechSynthesis.addEventListener("voiceschanged", reload);
    return () => speechSynthesis.removeEventListener("voiceschanged", reload);
  }, [language]);
  return voices;
}

/**
 * 設定の「音声入力」の読み上げ（音声モード）: 声の方法（この Mac の声 = 無料 / OpenAI の声 = 有料）のカード・声・速さと「試しに聞く」。
 * OpenAI の声で API キーがまだなければ、ここでも保存できる（文字起こしを「この Mac」にしていても、読み上げだけ OpenAI にできる）
 */
export function VoiceSpeechSettings({ status, draft, apply }: { status: VoiceStatus | undefined; draft: AppSettings; apply: (patch: Partial<AppSettings>) => void }) {
  const openai = draft.voice_tts_provider === "openai";
  const voices = useSystemVoices(draft.voice_language);
  const [speaking, setSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const latestRef = useLatest(draft);
  // 読み上げる部品は初めて試すときに作る（描く中で ref に書かない）
  const speaker = useRef<Speaker | null>(null);
  const speakerOf = () => {
    if (!speaker.current) speaker.current = new Speaker(() => latestRef.current, setSpeaking, setError);
    return speaker.current;
  };
  useEffect(() => () => speaker.current?.stop(), []);
  // 設定を閉じた・別の項目へ移ったら読み上げをやめる（ページを離れるときも）
  useWindowEvent("pagehide", () => speaker.current?.stop());

  const preview = () => {
    setError(null);
    if (speaking) return speaker.current?.stop();
    speakerOf().enqueue(sampleText(draft.voice_language));
  };

  return (
    <Field as="div" label="読み上げ（音声モード）" help="チャット欄の波形のボタンの音声モードで、AI の返答の文章を読み上げます。コード・表は読まずに「画面に出しました」と伝えます。">
      <div className="voice-providers" role="radiogroup" aria-label="読み上げの声">
        {VOICE_TTS_PROVIDERS.map((p) => (
          <VoiceProviderCard key={p} name="voice-tts-provider" info={VOICE_TTS_PROVIDER_INFO[p]} selected={draft.voice_tts_provider === p} onSelect={() => apply({ voice_tts_provider: p })} />
        ))}
      </div>
      {openai && !status?.openai.key_saved && draft.voice_provider !== "openai" && <OpenAiKeyField saved={status?.openai.key_saved} />}
      <div className="voice-speech-row">
        <label className="voice-speech-field">
          <span>声</span>
          {openai ? (
            <select value={draft.voice_tts_openai_voice} onChange={(e) => apply({ voice_tts_openai_voice: e.target.value })}>
              {OPENAI_TTS_VOICES.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          ) : (
            <select value={draft.voice_tts_voice} onChange={(e) => apply({ voice_tts_voice: e.target.value })}>
              <option value="">話す言語の既定の声</option>
              {voices.map((v) => (
                <option key={v.name} value={v.name}>
                  {v.name}
                </option>
              ))}
            </select>
          )}
        </label>
        <label className="voice-speech-field">
          <span>速さ</span>
          <select value={draft.voice_tts_rate} onChange={(e) => apply({ voice_tts_rate: Number(e.target.value) })}>
            {VOICE_TTS_RATES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="btn voice-speech-preview" disabled={!draft.voice_enabled && openai} onClick={preview}>
          {speaking ? <Square size={13} aria-hidden /> : <Volume2 size={14} aria-hidden />}
          {speaking ? "止める" : "試しに聞く"}
        </button>
      </div>
      {openai && !draft.voice_enabled && <p className="field-help">OpenAI の声を試すには、いちばん上のスイッチを入れてください。</p>}
      <ErrorText message={error ?? undefined} />
    </Field>
  );
}
