import type { VoiceModelInfo } from "@shared/types";
import { api } from "@/api";
import { cx } from "@/lib/cx";
import { confirmDialog } from "@/ui/dialogs";
import { useAction } from "@/hooks/useAction";
import { voiceStatusStore } from "@/stores/voice";
import { ErrorText } from "@/ui/ErrorText";
import { formatModelSize } from "./voiceOptions";

/** 精度・速さの目安の目盛り（4 つの点のうち value 個を塗る） */
function Meter({ label, value }: { label: string; value: number }) {
  return (
    <span className="voice-meter" title={`${label}: ${value} / 4`}>
      {label}
      <span className="voice-meter-dots" aria-label={`${value} / 4`}>
        {[1, 2, 3, 4].map((i) => (
          <span key={i} className={cx("voice-meter-dot", i <= value && "on")} />
        ))}
      </span>
    </span>
  );
}

/** 落としている途中の割合（大きさが分からなければ null） */
const percentOf = (m: VoiceModelInfo) => (m.download?.total ? Math.floor((m.download.received / m.download.total) * 100) : null);

/**
 * この Mac で使う whisper のモデルの一覧（使うものを選ぶ・精度と速さの目盛り・ダウンロード・進み具合・削除）。
 * 選んだモデルはその場で保存する。選んだのにまだダウンロードしていなければ、そう添える
 */
export function VoiceModelList({ models, selected, onSelect }: { models: VoiceModelInfo[] | undefined; selected: string; onSelect: (id: string) => void }) {
  const action = useAction();
  if (!models) return <p className="muted small">読み込み中…</p>;

  const download = (m: VoiceModelInfo) => action.guard(async () => voiceStatusStore.set(await api.downloadVoiceModel(m.id)));
  const remove = async (m: VoiceModelInfo) => {
    const downloading = Boolean(m.download && !m.download.error);
    if (!downloading && !(await confirmDialog({ title: `モデル（${m.label}）を削除しますか？`, message: "使うときは、もう一度ダウンロードします。", confirmLabel: "削除", danger: true }))) return;
    await action.guard(async () => voiceStatusStore.set(await api.deleteVoiceModel(m.id)));
  };

  return (
    <div className="voice-models" role="radiogroup" aria-label="使うモデル">
      {models.map((m) => {
        const percent = percentOf(m);
        const downloading = Boolean(m.download && !m.download.error);
        return (
          <div key={m.id} className={cx("voice-model", m.id === selected && "selected")}>
            <label className="voice-model-head">
              <input type="radio" name="voice-model" checked={m.id === selected} onChange={() => onSelect(m.id)} />
              <span className="voice-model-name">{m.label}</span>
              {m.recommended && <span className="badge voice-model-recommended">おすすめ</span>}
              <span className="voice-model-meters">
                <Meter label="精度" value={m.accuracy} />
                <Meter label="速さ" value={m.speed} />
              </span>
            </label>
            <p className="field-help voice-model-note">{m.note}</p>
            <div className="voice-model-actions">
              {m.downloaded ? (
                <>
                  <span className="success small">ダウンロード済み（{formatModelSize(m.size_mb)}）</span>
                  <button type="button" className="btn btn-sm btn-danger-text" onClick={() => void remove(m)}>
                    削除
                  </button>
                </>
              ) : downloading ? (
                <>
                  <span className="meter voice-model-progress">
                    <span className="meter-track" role="progressbar" aria-label={`${m.label} のダウンロード`} aria-valuenow={percent ?? undefined} aria-valuemin={0} aria-valuemax={100}>
                      <span className="meter-fill" style={{ width: `${percent ?? 0}%` }} />
                    </span>
                  </span>
                  <span className="small">{percent === null ? "ダウンロード中…" : `${percent}%`}</span>
                  <button type="button" className="btn btn-sm" onClick={() => void remove(m)}>
                    やめる
                  </button>
                </>
              ) : (
                <>
                  {m.download?.error && <ErrorText message={m.download.error} />}
                  <button type="button" className={cx("btn btn-sm", m.id === selected && "btn-primary")} onClick={() => void download(m)}>
                    {m.download?.error ? "もう一度ダウンロード" : `ダウンロード（${formatModelSize(m.size_mb)}）`}
                  </button>
                  {m.id === selected && !m.download?.error && <span className="voice-model-hint small">使うにはダウンロードしてください</span>}
                </>
              )}
            </div>
          </div>
        );
      })}
      <ErrorText message={action.error} />
    </div>
  );
}
