import { VOICE_LANGUAGES, type VoiceStatus } from "@shared/types";
import { voiceStatusStore } from "@/stores/voice";
import { ErrorText } from "@/ui/ErrorText";
import { Field } from "@/ui/Field";
import { RefreshButton } from "@/ui/IconButton";
import { VoiceStep } from "./VoiceStep";

/** 起こす言語の名前（ja-JP → 日本語（ja-JP）。一覧にない言語は地域つきのコードだけ） */
function localeLabel(locale: string): string {
  const name = VOICE_LANGUAGES.find((l) => l.value === locale.split("-")[0])?.label;
  return name ? `${name}（${locale}）` : locale;
}

/**
 * 「macOS の音声認識」で文字起こしするときの準備: 入れるものはなく、① この Mac で使えるか（macOS 26 以上）
 * ② 話す言語のモデル（macOS が持つ。まだなければ、はじめて使うときに macOS が落とす）を確かめて見せるだけ
 */
export function VoiceMacosSetup({ voice, language }: { voice: { data: VoiceStatus | undefined; loading: boolean; error: string | undefined }; language: string }) {
  const speech = voice.data?.macos;
  const usable = speech ? speech.helper && speech.available : undefined;
  return (
    <Field as="div" label="macOS の音声認識の準備">
      <ol className="voice-steps">
        <VoiceStep n={1} done={usable} title="この Mac で使えるかを確かめる" badge={<span className="voice-price free">入れるものはありません</span>}>
          {usable && <p className="field-help">この Mac で使えます。</p>}
          {usable === false && (
            <p className="field-help">
              {speech?.helper ? "macOS 26 以上の、対応している Mac で使えます。この Mac では使えないので、ほかの方法を選んでください。" : "この Kickoff には、macOS の音声認識の補助プログラムが入っていません。ほかの方法を選んでください。"}
            </p>
          )}
          <div className="voice-step-actions">
            <RefreshButton label="確かめ直す" title="使えるかを確かめ直す" busy={voice.loading} onClick={() => void voiceStatusStore.reload()} type="button" />
            <span className="muted small">確かめ直す</span>
          </div>
          <ErrorText message={voice.error} />
        </VoiceStep>
        <VoiceStep n={2} done={usable ? Boolean(speech?.locale && speech.installed) : undefined} title="話す言語のモデル">
          {usable && !speech?.locale && <p className="field-help">選んだ言語には対応していません。上の「話す言語」を変えてください。</p>}
          {usable && speech?.locale && (
            <p className="field-help">
              {language === "auto" ? `自動の判別はできないので、Mac の言語の${localeLabel(speech.locale)}で起こします。` : `${localeLabel(speech.locale)}で起こします。`}
              {speech.installed ? "モデルは Mac に入っています。" : "モデルは、はじめて使うときに macOS がダウンロードします（その 1 回だけ、少し時間がかかります）。"}
            </p>
          )}
        </VoiceStep>
      </ol>
    </Field>
  );
}
