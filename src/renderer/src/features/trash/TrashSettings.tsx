import { useState } from "react";
import { FolderGit2, RotateCcw } from "lucide-react";
import { ARCHIVE_CLEANUP_DAYS, ARCHIVE_CLEANUP_DAYS_LABELS, type ArchiveCleanupDays, type TrashItem } from "@shared/types";
import { formatSize } from "@shared/attachment/truncate";
import { api } from "@/api";
import { useTrashedProjects, useUnassignedTrash } from "@/stores/trash";
import { useAsync } from "@/hooks/useAsync";
import { useAction } from "@/hooks/useAction";
import { useTicker } from "@/hooks/useTicker";
import { Field } from "@/ui/Field";
import { ErrorText } from "@/ui/ErrorText";
import { confirmDialog } from "@/ui/dialogs";
import { showToast } from "@/ui/toast";
import { formatDayTime } from "@/lib/time";
import { restoreFromTrash } from "./trashActions";
import { remainingText } from "./trashText";
import { TrashRow } from "./TrashTab";
import { OrphanSessions } from "./OrphanSessions";

/**
 * 設定の「ゴミ箱と整理」（メモの仕様書「ファイル削除」の Q17・Q19・Q20）: ゴミ箱に入れたプロジェクト（プロジェクトの「ゴミ箱」タブには出せない）を戻す口・
 * アーカイブ済みのチャットの整理（日数を選んで、それより動いていないものをまとめてゴミ箱へ）・どのチャットも使っていない会話記録の一覧・
 * どのプロジェクトにも出ないゴミ箱のもの（プロジェクトの外の会話記録など）
 */
export function TrashSettings() {
  return (
    <>
      <TrashedProjects />
      <ArchiveCleanup />
      <OrphanSessions />
      <UnassignedTrash />
    </>
  );
}

function TrashedProjects() {
  const { data, error } = useTrashedProjects();
  useTicker(60_000);
  const items = data ?? [];
  return (
    <section className="section">
      <h2>ゴミ箱のプロジェクト</h2>
      <p className="muted small">削除したプロジェクトは、チャット・DB の接続・定型文・設定ごと 3 日取っておき、ここから戻せます。3 日たつと本当に消えます（プロジェクトのフォルダはどちらでも消えません）。</p>
      <ErrorText message={error} />
      {items.length === 0 ? (
        <p className="muted small">ゴミ箱にプロジェクトはありません。</p>
      ) : (
        <ul className="trash-list">
          {items.map((item) => (
            <TrashedProjectRow key={item.id} item={item} />
          ))}
        </ul>
      )}
    </section>
  );
}

function TrashedProjectRow({ item }: { item: TrashItem }) {
  const { busy, run } = useAction();
  return (
    <li className="trash-row">
      <FolderGit2 size={16} className="trash-row-icon" aria-hidden />
      <div className="trash-row-main">
        <div className="trash-row-title">
          <span className="trash-row-name">{item.label}</span>
        </div>
        <div className="trash-row-meta muted small">
          <span title={new Date(item.trashed_at).toLocaleString()}>{formatDayTime(item.trashed_at)} に削除</span>
          <span className="trash-row-remaining" title={`${new Date(item.expires_at).toLocaleString()} に消えます`}>
            {remainingText(item.expires_at)}
          </span>
        </div>
      </div>
      <button type="button" className="btn btn-sm" disabled={busy !== null} onClick={() => void run("restore", () => restoreFromTrash(item))}>
        <RotateCcw size={14} aria-hidden />
        元に戻す
      </button>
    </li>
  );
}

function ArchiveCleanup() {
  const [days, setDays] = useState<ArchiveCleanupDays>(30);
  const preview = useAsync(() => api.archiveCleanupPreview(days), [days]);
  const { busy, error, run } = useAction();
  const count = preview.data?.days === days ? preview.data.count : null;
  const size = preview.data?.days === days ? preview.data.size : null;
  const clean = () =>
    run("clean", async () => {
      if (!count) return;
      const ok = await confirmDialog({
        title: `アーカイブ済みのチャット ${count} 件をゴミ箱に入れますか？`,
        message: `${ARCHIVE_CLEANUP_DAYS_LABELS[days]}より前から動いていないものです（子チャットも一緒に）。3 日はそれぞれのプロジェクトの「ゴミ箱」から戻せ、3 日たつと会話の記録ごと本当に消えます。`,
        confirmLabel: "ゴミ箱に入れる",
        danger: true,
      });
      if (!ok) return;
      const result = await api.archiveCleanup(days);
      showToast(`アーカイブ済みのチャット ${result.trashed} 件をゴミ箱に入れました（3 日は各プロジェクトの「ゴミ箱」から戻せます）`);
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
            {count === null ? "数えています…" : count === 0 ? "当てはまるチャットはありません" : `${count} 件${size ? `（会話の記録 ${formatSize(size)}）` : ""}`}
          </span>
          <button type="button" className="btn btn-danger btn-sm" disabled={!count || busy !== null} onClick={() => void clean()}>
            ゴミ箱に入れる
          </button>
        </div>
        <ErrorText message={preview.error ?? error} />
      </div>
    </section>
  );
}

/** どのプロジェクトにも出ないゴミ箱のもの（プロジェクトの外の会話記録など。あるときだけ出す） */
function UnassignedTrash() {
  const { data } = useUnassignedTrash();
  useTicker(60_000);
  if (!data?.length) return null;
  return (
    <section className="section">
      <h2>ゴミ箱（プロジェクトのないもの）</h2>
      <p className="muted small">どのプロジェクトのフォルダにも入らない場所のものです。3 日たつと本当に消えます。</p>
      <ul className="trash-list">
        {data.map((item) => (
          <TrashRow key={item.id} item={item} />
        ))}
      </ul>
    </section>
  );
}
