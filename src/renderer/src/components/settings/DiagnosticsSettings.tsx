import { Activity } from "lucide-react";

/**
 * 診断: 重いときに、再起動せずその場で性能の記録を取る（10 秒）。押すと設定を閉じ、記録の間も操作を続けられる
 * （様子は画面の右下の DiagnosticsIndicator に出る）。アプリのメニューの「ヘルプ → 性能の記録を取る」と同じ
 */
export function DiagnosticsSettings({ onClose }: { onClose: () => void }) {
  const available = Boolean(window.kickoff);
  return (
    <section className="section">
      <h2>診断</h2>
      <div className="form">
        <p className="muted small">
          Kickoff が重いと感じたら、再起動する前に記録を取ってください。10 秒の間に、画面の要素の数・メモリ・どの処理に時間を使ったか（CPU プロファイル）を集めて保存します。保存したフォルダの場所をチャットに貼ると、原因を調べられます。
        </p>
        <p className="muted small">メニューの「ヘルプ → 性能の記録を取る」からも始められます。記録の間は、重いと感じる操作をそのまま続けてください。</p>
        <div>
          <button
            type="button"
            className="btn"
            disabled={!available}
            onClick={() => {
              onClose();
              void window.kickoff?.diagnostics.start();
            }}
          >
            <Activity size={14} aria-hidden />
            性能の記録を取る（10 秒）
          </button>
          {!available && <p className="muted small">デスクトップアプリでだけ使えます</p>}
        </div>
      </div>
    </section>
  );
}
