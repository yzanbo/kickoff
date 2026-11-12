import { NotebookPen, Play, RotateCcw, StickyNote } from "lucide-react";
import { useEffect, useState } from "react";
import { appendDbMemoFix, DB_FAILURE_CAUSES, DB_FAILURE_LABELS, dbFailureDocument, dbFailureKind, dbFixText, dbMemoFixEntry } from "@shared/database/dbFailure";
import { localToday } from "@shared/database/dbPrep";
import { errorMessage } from "@shared/errors";
import { DB_ENVIRONMENT_LABELS, type DbConnection } from "@shared/types";
import { api } from "@/api";
import { useAsync } from "@/hooks/useAsync";
import { useModalDialog } from "@/hooks/useModalDialog";
import { formatDayTime, relativeTime } from "@/lib/time";
import { dbConnectionsStore } from "@/stores/dbConnections";
import { promptDialog } from "@/ui/dialogs";
import { DialogActions } from "@/ui/DialogActions";
import { ErrorText } from "@/ui/ErrorText";
import { Markdown } from "@/ui/markdown/Markdown";
import type { HandOffItem } from "@/features/chat/handoff/handOff";
import { HandOffButton } from "@/features/chat/handoff/HandOffMenu";

/** 失敗の文から見分けた種類と、よくある原因（接続のダイアログの「つながるか試す」と、つながらないときの案内で共通） */
export function DbFailureHelp({ error }: { error: string }) {
  const kind = dbFailureKind(error);
  return (
    <div className="db-failure-help small">
      <p className="db-failure-kind">よくある原因（{DB_FAILURE_LABELS[kind]}）</p>
      <ul>
        {DB_FAILURE_CAUSES[kind].map((cause) => (
          <li key={cause}>{cause}</li>
        ))}
      </ul>
    </div>
  );
}

/** つながらない様子を渡すもの（一言と、押した時点の失敗の文・接続の設定（パスワードなし）・手順メモの場所の札。作業場所は聞かずに本体で） */
function failureItem(projectId: number, c: DbConnection, error: string): HandOffItem {
  return {
    projectId,
    what: `「${c.name}」につながらない様子（失敗の文・接続の設定・手順メモの場所）`,
    text: dbFixText(c),
    capture: () => api.capture({ name: "db-failure.md", mime: "text/markdown", text: dbFailureDocument(c, error), source: { type: "db_failure", label: c.name, url: null } }),
  };
}

/** 手順メモの「つながらないときの直し方」に 1 行足す（直し方を聞いて、いまの中身に足して保存。開いたあとでほかで変わっていれば 409）。足したら true */
async function appendFixToMemo(projectId: number, path: string, error: string): Promise<boolean> {
  const fix = await promptDialog({
    title: "手順メモに直し方を追記",
    message: `何をしたらつながったかを、手順メモ「${path}」の「つながらないときの直し方」に、日付と失敗の種類を添えて 1 行で足します。次につながらないとき、この案内に出ます。`,
    label: "直し方",
    placeholder: "例: VPN をつなぎ直した / いまの IP をセキュリティグループに足した",
    confirmLabel: "追記する",
  });
  if (!fix?.trim()) return false;
  const now = await api.memo(projectId, path);
  await api.saveMemo(projectId, path, appendDbMemoFix(now.content, dbMemoFixEntry(localToday(), error, fix)), now.hash);
  return true;
}

/**
 * つながらないときの案内（木の接続の失敗の行の「直し方を見る」から）: 失敗の文・見分けた種類とよくある原因・最後につながった日時・
 * 手順メモの中身（なければ作る。あれば「直し方を追記…」で、直ったときの直し方を 1 行足す）・「AI に渡す ▾」（AI に見せない接続では出さない）・「準備を流す…」（準備のコマンドがあれば）・「つなぎ直す」
 */
export function DbFailureDialog({
  projectId,
  connection: c,
  error,
  onMemo,
  onRetry,
  onPrep,
  onClose,
}: {
  projectId: number;
  connection: DbConnection;
  error: string;
  /** 手順メモを DB クライアントのタブで開く（なければ作ってから） */
  onMemo: () => void;
  /** 開いていた段を読み直す（なければ出さない） */
  onRetry?: () => void;
  /** つなぐ前の準備のダイアログを出す（準備のコマンドがあるときだけ出す） */
  onPrep: () => void;
  onClose: () => void;
}) {
  const dialog = useModalDialog();
  // つながった時刻はつなぐたびには知らせない（一覧を取り直させない）ので、開いたときに一覧を読み直して「最後につながった」を新しくする
  useEffect(() => dbConnectionsStore.invalidate(projectId), [projectId]);
  const memo = useAsync(() => (c.memo_path ? api.memo(projectId, c.memo_path) : Promise.resolve(null)), [projectId, c.memo_path]);
  const then = (run: () => void) => () => {
    dialog.close();
    run();
  };

  const [memoError, setMemoError] = useState<string>();
  const appendFix = async () => {
    if (!c.memo_path) return;
    setMemoError(undefined);
    try {
      if (await appendFixToMemo(projectId, c.memo_path, error)) memo.reload();
    } catch (e) {
      setMemoError(errorMessage(e));
    }
  };

  return (
    <dialog ref={dialog.ref} className="dialog app-dialog db-failure-dialog" aria-label="つながらないときの案内" onClose={onClose}>
      <div className="app-dialog-body">
        <h2 className="app-dialog-title">
          「{c.name}」につながりません<span className={`db-failure-env db-env-${c.environment}`}>{DB_ENVIRONMENT_LABELS[c.environment]}</span>
        </h2>
        <pre className="db-failure-error">{error}</pre>
        <DbFailureHelp error={error} />
        <p className="small muted">
          {c.last_connected_at ? (
            <span title={formatDayTime(c.last_connected_at)}>最後につながったのは {relativeTime(c.last_connected_at)}（{formatDayTime(c.last_connected_at)}）</span>
          ) : (
            "まだ一度もつながっていません"
          )}
        </p>
        <section className="db-failure-memo">
          <div className="db-failure-memo-head">
            <StickyNote size={14} aria-hidden />
            <span>手順メモ</span>
            {c.memo_path && <span className="muted small">{c.memo_path}</span>}
            <span className="db-failure-memo-tools">
              {c.memo_path ? (
                <>
                  <button type="button" className="btn btn-sm" disabled={!memo.data} onClick={() => void appendFix()} data-tip="つながったら、何をしたら直ったかを手順メモに 1 行足す">
                    <NotebookPen size={13} aria-hidden /> 直し方を追記…
                  </button>
                  <button type="button" className="btn btn-sm" onClick={then(onMemo)}>
                    開く
                  </button>
                </>
              ) : (
                <button type="button" className="btn btn-sm" onClick={then(onMemo)}>
                  手順メモを作る…
                </button>
              )}
            </span>
          </div>
          <ErrorText message={memoError} />
          {!c.memo_path && <p className="small muted">つなぐ前にやること・直し方を残しておくと、次につながらないときにここに出ます。</p>}
          {c.memo_path && memo.loading && <p className="small muted">読み込み中…</p>}
          {c.memo_path && memo.error && <p className="small muted">手順メモが見つかりません（名前を変えた・消したなら、接続の編集で選び直してください）</p>}
          {memo.data && (
            <div className="db-failure-memo-body">
              <Markdown>{memo.data.content}</Markdown>
            </div>
          )}
        </section>
        <DialogActions className="db-failure-actions">
          {c.ai_access !== "none" && <HandOffButton item={failureItem(projectId, c, error)} small={false} onPick={() => dialog.close()} />}
          {c.prep && c.prep.prepare.length > 0 && (
            <button type="button" className="btn" onClick={then(onPrep)}>
              <Play size={14} aria-hidden /> 準備を流す…
            </button>
          )}
          <span className="db-failure-spacer" />
          <button type="button" className="btn" onClick={() => dialog.close()}>
            閉じる
          </button>
          {onRetry && (
            <button type="button" className="btn btn-primary" onClick={then(onRetry)}>
              <RotateCcw size={14} aria-hidden /> つなぎ直す
            </button>
          )}
        </DialogActions>
      </div>
    </dialog>
  );
}
