import { Lock, Plus, Sparkles, StickyNote } from "lucide-react";
import { useState } from "react";
import { errorMessage } from "@shared/foundation/errors";
import { isAiVisible } from "@shared/database/aiVisibility";
import { DB_AI_ACCESS_LABELS, DB_ENVIRONMENT_LABELS, type DbConnection, type DbImportCandidate } from "@shared/database/types";
import { api } from "@/foundation/ui/api";
import { useQuery } from "@/foundation/ui/query";
import { cx } from "@/foundation/ui/lib/cx";
import { relativeTime } from "@/foundation/ui/lib/time";
import { dbConnectionsStore, useDbConnectedIds } from "@/features/database/ui/client/connectionsStore";
import { ErrorText } from "@/foundation/ui/kit/ErrorText";
import { StatusDot } from "@/foundation/ui/kit/StatusDot";
import { connectionPlace, ENGINE_MARKS } from "./dbFormat";

/**
 * 接続のホーム（タブを開いていないとき）: このプロジェクトの接続を環境の色のカードで並べ（押すと左の木でその接続を開く・右クリックは接続のメニュー）、
 * 下にプロジェクトの中で見つけた、まだ登録していない DB の候補（「＋ 足す」で名前と環境は案のまま取り込む）
 */
export function DbHome({
  projectId,
  connections,
  onOpen,
  onMenu,
  onAdd,
}: {
  projectId: number;
  connections: DbConnection[];
  onOpen: (connection: DbConnection) => void;
  onMenu: (e: React.MouseEvent, connection: DbConnection) => void;
  onAdd: () => void;
}) {
  const connected = useDbConnectedIds(projectId).data;
  // 登録が変わったら探し直す（足した候補を消す）
  const found = useQuery(["DbHome.found", projectId, connections.length], () => api.dbImportCandidates(projectId), { keepPrevious: true });
  const candidates = (found.data ?? []).filter((c) => c.existing_id === null);
  return (
    <div className="db-home">
      <div className="db-home-head">
        <h2 className="db-home-title">このプロジェクトの DB</h2>
        <span className="small muted">{connections.length} つの接続</span>
        <button type="button" className="btn" data-size="sm" onClick={onAdd}>
          <Plus size={13} aria-hidden /> 接続を足す
        </button>
      </div>
      <div className="db-home-body">
        <div className="db-home-cards">
          {connections.map((c) => (
            <button key={c.id} type="button" className={cx("db-home-card", `db-env-${c.environment}`)} onClick={() => onOpen(c)} onContextMenu={(e) => onMenu(e, c)} title={`${c.name}（左の木で開く。右クリックで接続のメニュー）`}>
              <span className="db-home-card-top">
                <span className="db-engine-mark">{ENGINE_MARKS[c.engine]}</span>
                <span className="db-home-card-name">{c.name}</span>
                {connected?.includes(c.id) && (
                  <span data-tip="つないでいます" aria-label="つないでいます">
                    <StatusDot tone="ok" />
                  </span>
                )}
                {c.note_path && <StickyNote size={12} className="db-home-card-note" aria-label="手順ノートあり" />}
              </span>
              <span className="db-home-card-place small muted">{connectionPlace(c)}</span>
              <span className="db-home-card-foot small">
                <span className="db-home-env">
                  <span className="db-env-dot" aria-hidden />
                  {DB_ENVIRONMENT_LABELS[c.environment]}
                </span>
                {c.read_only && (
                  <span className="db-home-tag">
                    <Lock size={11} aria-hidden /> 読み取り専用
                  </span>
                )}
                {isAiVisible(c) && (
                  <span className="db-home-tag">
                    <Sparkles size={11} aria-hidden /> AI に{DB_AI_ACCESS_LABELS[c.ai_access]}
                  </span>
                )}
                {c.last_connected_at && <span className="db-home-when muted">{relativeTime(c.last_connected_at)}</span>}
              </span>
            </button>
          ))}
          <button type="button" className="db-home-card db-home-card-add" onClick={onAdd}>
            <Plus size={16} aria-hidden /> 接続を足す
          </button>
        </div>
        {candidates.length > 0 && (
          <section className="db-home-found">
            <h3 className="db-home-found-title small">プロジェクトの中に、まだ登録していない DB が見つかりました</h3>
            <ul className="db-home-found-list">
              {candidates.map((c) => (
                <Candidate key={c.key} projectId={projectId} candidate={c} />
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}

/** 未登録の DB の候補の 1 行（「＋ 足す」で、名前と環境は案のまま取り込む） */
function Candidate({ projectId, candidate: c }: { projectId: number; candidate: DbImportCandidate }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const add = async () => {
    setBusy(true);
    setError(undefined);
    try {
      await api.importDbConnections(projectId, { items: [{ key: c.key, name: c.name, environment: c.environment }] });
      dbConnectionsStore.invalidate(projectId);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };
  return (
    <li className={cx("db-home-found-item", `db-env-${c.environment}`)}>
      <span className="db-engine-mark">{ENGINE_MARKS[c.engine]}</span>
      <span className="db-home-found-text">
        <span>{c.origin}</span>
        <span className="small muted">
          （{connectionPlace(c)} · {DB_ENVIRONMENT_LABELS[c.environment]}）
        </span>
        <ErrorText message={error} />
      </span>
      <button type="button" className="btn" data-size="sm" disabled={busy} onClick={() => void add()} title={`「${c.name}」として${DB_ENVIRONMENT_LABELS[c.environment]}の接続に足す`}>
        <Plus size={13} aria-hidden /> 足す
      </button>
    </li>
  );
}
