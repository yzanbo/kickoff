import type { VoiceModelInfo } from "@shared/types";
import { api } from "@/api";
import { cx } from "@/lib/cx";
import { confirmDialog } from "@/ui/dialogs";
import { useActionError } from "@/hooks/useActionError";
import { voiceStatusStore } from "@/stores/voice";
import { ErrorText } from "@/ui/ErrorText";

/** モデルの大きさ（1000MB からは GB） */
const formatSize = (mb: number) => (mb >= 1000 ? `${(mb / 1000).toFixed(1)} GB` : `${mb} MB`);

/** 落としている途中の割合（大きさが分からなければ null） */
const percentOf = (m: VoiceModelInfo) => (m.download?.total ? Math.floor((m.download.received / m.download.total) * 100) : null);

/**
 * この Mac で使う whisper のモデルの一覧（使うものを選ぶ・ダウンロード・進み具合・削除）。
 * 選んだモデルは、ほかの設定と一緒に保存する
 */
export function VoiceModelList({ models, selected, onSelect }: { models: VoiceModelInfo[] | undefined; selected: string; onSelect: (id: string) => void }) {
  const action = useActionError();
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
              <span className="muted small">{formatSize(m.size_mb)}</span>
            </label>
            <p className="field-help voice-model-note">{m.note}</p>
            <div className="voice-model-actions">
              {m.downloaded ? (
                <>
                  <span className="success small">ダウンロード済み</span>
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
                  <button type="button" className="btn btn-sm" onClick={() => void download(m)}>
                    {m.download?.error ? "もう一度ダウンロード" : "ダウンロード"}
                  </button>
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
