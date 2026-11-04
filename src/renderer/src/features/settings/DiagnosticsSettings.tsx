import { Activity } from "lucide-react";
import { useAsync } from "@/hooks/useAsync";
import { DiagnosticsPath } from "@/features/diagnostics/DiagnosticsPath";
import { Field } from "@/ui/Field";

/**
 * 診断: 重いときに、再起動せずその場で性能の記録を取る（10 秒）。押すと設定を閉じ、記録の間も操作を続けられる
 * （様子は画面の右下の DiagnosticsIndicator に出る）。アプリのメニューの「ヘルプ → 性能の記録を取る」と同じ
 */
export function DiagnosticsSettings({ onClose }: { onClose: () => void }) {
  const available = Boolean(window.kickoff);
  // 保存先と最近の記録（新しい順）。デスクトップアプリでだけ取れる
  const folders = useAsync(async () => (await window.kickoff?.diagnostics.folders()) ?? null);
  return (
    <section className="section">
      <h2>診断</h2>
      <div className="form">
        <p className="muted small">
          Kickoff が重いと感じたら、再起動する前に記録を取ってください。10 秒の間に、画面の要素の数・メモリ・文字入力などの操作が画面に出るまでの時間・どの処理に時間を使ったか（画面とメインプロセスの CPU プロファイル）・DB の大きさを集めて保存します。保存したフォルダの場所をコピーしてチャットに貼ると、原因を調べられます。
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
        {folders.data && (
          <Field
            as="div"
            label="保存先"
            help="記録ごとに、日時の名前のフォルダ（summary.json と、Chrome の開発者ツールで開ける profile.cpuprofile（画面）・main.cpuprofile（メインプロセス））を作ります。"
          >
            <DiagnosticsPath dir={folders.data.root} onOpen={() => void window.kickoff?.diagnostics.openRoot()} />
          </Field>
        )}
        {folders.data && folders.data.records.length > 0 && (
          <Field as="div" label="最近の記録（新しい順）">
            {folders.data.records.map((dir) => (
              <DiagnosticsPath key={dir} dir={dir} />
            ))}
          </Field>
        )}
      </div>
    </section>
  );
}
