import { Play, RotateCcw, Sparkles, StickyNote } from "lucide-react";
import { useState } from "react";
import { DB_FAILURE_CAUSES, DB_FAILURE_LABELS, dbFailureKind, dbFixPrompt } from "@shared/database/dbFailure";
import { errorMessage } from "@shared/errors";
import { DB_ENVIRONMENT_LABELS, type DbConnection } from "@shared/types";
import { api } from "@/api";
import { useAsync } from "@/hooks/useAsync";
import { useModalDialog } from "@/hooks/useModalDialog";
import { formatDayTime, relativeTime } from "@/lib/time";
import { confirmDialog } from "@/ui/dialogs";
import { DialogActions } from "@/ui/DialogActions";
import { ErrorText } from "@/ui/ErrorText";
import { Markdown } from "@/ui/markdown/Markdown";
import { startDbChat } from "./dbChat";

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

/** つながらない接続を、新しいチャットで AI に直してもらう（失敗の文・接続の設定（パスワードなし）・手順メモの場所を送る）。作ったら開く */
async function askAiToFix(projectId: number, c: DbConnection, error: string): Promise<boolean> {
  const ok = await confirmDialog({
    title: "AI に直してもらいますか？",
    message: `新しいチャットを作り、失敗の文と接続の設定（パスワードは入れません）${c.memo_path ? "・手順メモの場所" : ""}を送ります。AI は、ふつうのチャットと同じく承認を通してコマンド（AWS の CLI など）を流せます。直ったら手順メモに書き足すよう頼みます。`,
    confirmLabel: "チャットを作って送る",
  });
  if (!ok) return false;
  await startDbChat(projectId, dbFixPrompt(c, error), `DB「${c.name}」につながらない`);
  return true;
}

/**
 * つながらないときの案内（木の接続の失敗の行の「直し方を見る」から）: 失敗の文・見分けた種類とよくある原因・最後につながった日時・
 * 手順メモの中身（なければ作る）・「AI に直してもらう」・「準備を流す…」（準備のコマンドがあれば）・「つなぎ直す」
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
  const memo = useAsync(() => (c.memo_path ? api.memo(projectId, c.memo_path) : Promise.resolve(null)), [projectId, c.memo_path]);
  const [asking, setAsking] = useState(false);
  const [askError, setAskError] = useState<string>();
  const then = (run: () => void) => () => {
    dialog.close();
    run();
  };

  const ask = async () => {
    setAsking(true);
    setAskError(undefined);
    try {
      if (await askAiToFix(projectId, c, error)) dialog.close();
    } catch (e) {
      setAskError(errorMessage(e));
    } finally {
      setAsking(false);
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
                <button type="button" className="btn btn-sm" onClick={then(onMemo)}>
                  開く
                </button>
              ) : (
                <button type="button" className="btn btn-sm" onClick={then(onMemo)}>
                  手順メモを作る…
                </button>
              )}
            </span>
          </div>
          {!c.memo_path && <p className="small muted">つなぐ前にやること・直し方を残しておくと、次につながらないときにここに出ます。</p>}
          {c.memo_path && memo.loading && <p className="small muted">読み込み中…</p>}
          {c.memo_path && memo.error && <p className="small muted">手順メモが見つかりません（名前を変えた・消したなら、接続の編集で選び直してください）</p>}
          {memo.data && (
            <div className="db-failure-memo-body">
              <Markdown>{memo.data.content}</Markdown>
            </div>
          )}
        </section>
        <ErrorText message={askError} />
        <DialogActions className="db-failure-actions">
          <button type="button" className="btn" disabled={asking} onClick={() => void ask()}>
            <Sparkles size={14} aria-hidden /> {asking ? "チャットを作っています…" : "AI に直してもらう"}
          </button>
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
