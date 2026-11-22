import { useState } from "react";
import { FolderGit2 } from "lucide-react";
import { ARCHIVE_CLEANUP_DAYS, ARCHIVE_CLEANUP_DAYS_LABELS, type ArchiveCleanupDays, type TrashItem } from "@shared/trash/types";
import { formatBytes } from "@shared/foundation/text/bytes";
import { api } from "@/foundation/ui/api";
import { useTrashedProjects, useUnassignedTrash } from "@/features/trash/ui/stores/trash";
import { errorText, useQuery } from "@/foundation/ui/query";
import { useAction } from "@/foundation/ui/hooks/useAction";
import { useTicker } from "@/foundation/ui/hooks/useTicker";
import { Field } from "@/foundation/ui/kit/Field";
import { ErrorText } from "@/foundation/ui/kit/ErrorText";
import { confirm } from "@/foundation/ui/kit/ask";
import { showToast } from "@/foundation/ui/kit/toast";
import { formatDayTime } from "@/foundation/ui/lib/time";
import { remainingText } from "./trashText";
import { EmptyTrashButton, TrashRow, TrashRowActions } from "./TrashTab";
import { OrphanSessions } from "@/features/chat/ui/trash/OrphanSessions";

/**
 * 設定の「ゴミ箱と整理」: ゴミ箱に入れたプロジェクト（プロジェクトの「ゴミ箱」タブには出せない）を戻す口・
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
      <p className="muted small">削除したプロジェクトは、チャット・DB の接続・定型文・設定ごと 3 日取っておき、ここから戻せます。3 日たつと本当に消えます（待たずに完全に消すこともできます。プロジェクトのフォルダはどちらでも消えません）。</p>
      <EmptyTrashButton items={items} label="すべて完全に消す" title={`ゴミ箱のプロジェクト ${items.length} 件を完全に消しますか？`} />
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
      <TrashRowActions item={item} />
    </li>
  );
}

function ArchiveCleanup() {
  const [days, setDays] = useState<ArchiveCleanupDays>(30);
  const preview = useQuery(["TrashSettings.preview", days], () => api.archiveCleanupPreview(days), { keepPrevious: true });
  const { busy, error, run } = useAction();
  const count = preview.data?.days === days ? preview.data.count : null;
  const size = preview.data?.days === days ? preview.data.size : null;
  const clean = () =>
    run("clean", async () => {
      if (!count) return;
      const ok = await confirm({
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

/** どのプロジェクトにも出ないゴミ箱のもの（プロジェクトの外の会話記録など。あるときだけ出す） */
function UnassignedTrash() {
  const { data } = useUnassignedTrash();
  useTicker(60_000);
  if (!data?.length) return null;
  return (
    <section className="section">
      <h2>ゴミ箱（プロジェクトのないもの）</h2>
      <p className="muted small">どのプロジェクトのフォルダにも入らない場所のものです。3 日たつと本当に消えます（待たずに完全に消すこともできます）。</p>
      <EmptyTrashButton items={data} label="すべて完全に消す" title={`プロジェクトのないゴミ箱のもの ${data.length} 件を完全に消しますか？`} />
      <ul className="trash-list">
        {data.map((item) => (
          <TrashRow key={item.id} item={item} />
        ))}
      </ul>
    </section>
  );
}
