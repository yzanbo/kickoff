import type { VoiceStatus } from "@shared/types";
import { voiceStatusStore } from "@/stores/voice";
import { CopyButton } from "@/ui/CopyButton";
import { ErrorText } from "@/ui/ErrorText";
import { Field } from "@/ui/Field";
import { RefreshButton } from "@/ui/IconButton";
import { StatusDot, toneOf } from "@/ui/StatusDot";
import { VoiceModelList } from "./VoiceModelList";
import { VoiceStep } from "./VoiceStep";

const BREW_COMMAND = "brew install whisper-cpp ffmpeg";

/**
 * 「この Mac」で文字起こしするときの準備: ① whisper.cpp と ffmpeg（なければ brew のコマンドとコピー・確かめ直す）
 * ② 使うモデルを選んでダウンロード（どれも無料）。済んだ手順は ✓
 */
export function VoiceLocalSetup({
  voice,
  model,
  onModel,
}: {
  voice: { data: VoiceStatus | undefined; loading: boolean; error: string | undefined };
  model: string;
  onModel: (id: string) => void;
}) {
  const status = voice.data;
  const tools = status?.local;
  const toolsReady = tools ? Boolean(tools.whisper && tools.ffmpeg) : undefined;
  const chosen = tools?.models.find((m) => m.id === model);
  return (
    <Field as="div" label="この Mac の準備">
      <ol className="voice-steps">
        <VoiceStep n={1} done={toolsReady} title="文字起こしのツールを入れる">
          {toolsReady === false && (
            <>
              <p className="field-help">ターミナルで次のコマンドを実行してから、「確かめ直す」を押してください（どちらも無料です）。</p>
              <div className="voice-command">
                <code>{BREW_COMMAND}</code>
                <CopyButton text={BREW_COMMAND} label="コマンドをコピー" />
              </div>
            </>
          )}
          <ul className="voice-tools">
            <ToolRow name="whisper-cli（whisper.cpp）" path={tools?.whisper} loaded={Boolean(tools)} />
            <ToolRow name="ffmpeg" path={tools?.ffmpeg} loaded={Boolean(tools)} />
          </ul>
          <div className="voice-step-actions">
            <RefreshButton label="確かめ直す" title="ツールが入ったかを確かめ直す" busy={voice.loading} onClick={() => void voiceStatusStore.reload()} type="button" />
            <span className="muted small">確かめ直す</span>
          </div>
          <ErrorText message={voice.error} />
        </VoiceStep>
        <VoiceStep n={2} done={chosen ? chosen.downloaded : undefined} title="モデルを選んでダウンロード" badge={<span className="voice-price free">どれも無料</span>}>
          <p className="field-help">大きいモデルほど正確で、少し遅くなります。迷ったら「おすすめ」を。</p>
          <VoiceModelList models={tools?.models} selected={model} onSelect={onModel} />
        </VoiceStep>
      </ol>
    </Field>
  );
}

/** ツール 1 つの見つかったか（見つかればその場所） */
function ToolRow({ name, path, loaded }: { name: string; path: string | null | undefined; loaded: boolean }) {
  return (
    <li className="voice-tool">
      <StatusDot tone={toneOf(loaded ? Boolean(path) : undefined)} />
      <span className="voice-tool-name">{name}</span>
      <span className="muted small">{loaded ? (path ?? "見つかりません") : "確認中…"}</span>
    </li>
  );
}
