// 設定の「ゴミ箱と整理」のアーカイブ済みのチャットの整理（日数を選んで、それより動いていないものをまとめてゴミ箱へ）
import { useState } from "react";
import { ARCHIVE_CLEANUP_DAYS, ARCHIVE_CLEANUP_DAYS_LABELS, TRASH_KEEP_DAYS, type ArchiveCleanupDays } from "@shared/trash/types";
import { formatBytes } from "@shared/foundation/text/bytes";
import { errorText, useQuery } from "@/foundation/ui/query";
import { useAction } from "@/foundation/ui/hooks/useAction";
import { Field } from "@/foundation/ui/kit/Field";
import { ErrorText } from "@/foundation/ui/kit/ErrorText";
import { confirm } from "@/foundation/ui/kit/ask";
import { showToast } from "@/foundation/ui/kit/toast";
import { archiveCleanupApi } from "./api";

export function ArchiveCleanup() {
  const [days, setDays] = useState<ArchiveCleanupDays>(30);
  const preview = useQuery(["ArchiveCleanup.preview", days], () => archiveCleanupApi("GET /api/archive-cleanup", { query: { days } }), { keepPrevious: true });
  const { busy, error, run } = useAction();
  const count = preview.data?.days === days ? preview.data.count : null;
  const size = preview.data?.days === days ? preview.data.size : null;
  const clean = () =>
    run("clean", async () => {
      if (!count) return;
      const ok = await confirm({
        title: `アーカイブ済みのチャット ${count} 件をゴミ箱に入れますか？`,
        message: `${ARCHIVE_CLEANUP_DAYS_LABELS[days]}より前から動いていないものです（子チャットも一緒に）。${TRASH_KEEP_DAYS} 日はそれぞれのプロジェクトの「ゴミ箱」から戻せ、${TRASH_KEEP_DAYS} 日たつと会話の記録ごと本当に消えます。`,
        confirmLabel: "ゴミ箱に入れる",
        danger: true,
      });
      if (!ok) return;
      const result = await archiveCleanupApi("POST /api/archive-cleanup", { body: { days } });
      showToast(`アーカイブ済みのチャット ${result.trashed} 件をゴミ箱に入れました（${TRASH_KEEP_DAYS} 日は各プロジェクトの「ゴミ箱」から戻せます）`);
      preview.reload();
    });
  return (
    <section className="section">
      <h2>アーカイブ済みのチャットを整理</h2>
      <p className="muted small">アーカイブしたチャットは自動では消えません。たまったら、しばらく動いていないものをまとめてゴミ箱に入れられます。</p>
      <div className="form">
        <Field label="次の期間より前から動いていない">
          <select value={days} onChange={(e) => setDays(Number(e.target.value) as ArchiveCleanupDays)}>
            {ARCHIVE_CLEANUP_DAYS.map((d) => (
              <option key={d} value={d}>
                {ARCHIVE_CLEANUP_DAYS_LABELS[d]}
              </option>
            ))}
          </select>
        </Field>
        <div className="archive-cleanup-result">
          <span className="muted">
            {count === null ? "数えています…" : count === 0 ? "当てはまるチャットはありません" : `${count} 件${size ? `（会話の記録 ${formatBytes(size)}）` : ""}`}
          </span>
          <button type="button" className="btn btn-danger" data-size="sm" disabled={!count || busy !== null} onClick={() => void clean()}>
            ゴミ箱に入れる
          </button>
        </div>
        <ErrorText message={errorText(preview.error) ?? error} />
      </div>
    </section>
  );
}
