import { NotebookPen, Play, RotateCcw, StickyNote } from "lucide-react";
import { useEffect, useState } from "react";
import { appendDbNoteFix, DB_FAILURE_CAUSES, DB_FAILURE_LABELS, dbFailureDocument, dbFailureKind, dbFixText, dbNoteFixEntry } from "@shared/database/dbFailure";
import { localToday } from "@shared/database/dbPrep";
import { errorMessage } from "@shared/foundation/errors";
import { DB_ENVIRONMENT_LABELS, type DbConnection } from "@shared/database/types";
import { api } from "@/foundation/ui/api";
import { useQuery } from "@/foundation/ui/query";
import { useModalDialog } from "@/foundation/ui/hooks/useModalDialog";
import { formatDayTime, relativeTime } from "@/foundation/ui/lib/time";
import { dbConnectionsStore } from "@/features/database/ui/client/connectionsStore";
import { prompt } from "@/foundation/ui/kit/ask";
import { DialogActions } from "@/foundation/ui/kit/DialogActions";
import { ErrorText } from "@/foundation/ui/kit/ErrorText";
import { Markdown } from "@/foundation/ui/markdown/Markdown";
import type { HandOffItem } from "@/features/attachments/ui/handoff/handOff";
import { HandOffButton } from "@/features/attachments/ui/handoff/HandOffMenu";

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

/** つながらない様子を渡すもの（一言と、押した時点の失敗の文・接続の設定（パスワードなし）・手順ノートの場所の札。作業場所は聞かずに本体で） */
function failureItem(projectId: number, c: DbConnection, error: string): HandOffItem {
  return {
    projectId,
    what: `「${c.name}」につながらない様子（失敗の文・接続の設定・手順ノートの場所）`,
    text: dbFixText(c),
    capture: () => api.capture({ name: "db-failure.md", mime: "text/markdown", text: dbFailureDocument(c, error), source: { type: "db_failure", label: c.name, url: null } }),
  };
}

/** 手順ノートの「つながらないときの直し方」に 1 行足す（直し方を聞いて、いまの中身に足して保存。開いたあとでほかで変わっていれば 409）。足したら true */
async function appendFixToNote(projectId: number, path: string, error: string): Promise<boolean> {
  const fix = await prompt({
    title: "手順ノートに直し方を追記",
    message: `何をしたらつながったかを、手順ノート「${path}」の「つながらないときの直し方」に、日付と失敗の種類を添えて 1 行で足します。次につながらないとき、この案内に出ます。`,
    label: "直し方",
    placeholder: "例: VPN をつなぎ直した / いまの IP をセキュリティグループに足した",
    confirmLabel: "追記する",
  }).then((r) => r?.value ?? null);
  if (!fix?.trim()) return false;
  const now = await api.note(projectId, path);
  await api.saveNote(projectId, path, appendDbNoteFix(now.content, dbNoteFixEntry(localToday(), error, fix)), now.hash);
  return true;
}

/**
 * つながらないときの案内（木の接続の失敗の行の「直し方を見る」から）: 失敗の文・見分けた種類とよくある原因・最後につながった日時・
 * 手順ノートの中身（なければ作る。あれば「直し方を追記…」で、直ったときの直し方を 1 行足す）・「AI に渡す ▾」（AI に見せない接続では出さない）・「準備を流す…」（準備のコマンドがあれば）・「つなぎ直す」
 */
export function DbFailureDialog({
  projectId,
  connection: c,
  error,
  onNote,
  onRetry,
  onPrep,
  onClose,
}: {
  projectId: number;
  connection: DbConnection;
  error: string;
  /** 手順ノートを DB クライアントのタブで開く（なければ作ってから） */
  onNote: () => void;
  /** 開いていた段を読み直す（なければ出さない） */
  onRetry?: () => void;
  /** つなぐ前の準備のダイアログを出す（準備のコマンドがあるときだけ出す） */
  onPrep: () => void;
  onClose: () => void;
}) {
  const { ref: dialogRef, ...dialog } = useModalDialog();
  // つながった時刻はつなぐたびには知らせない（一覧を取り直させない）ので、開いたときに一覧を読み直して「最後につながった」を新しくする
  useEffect(() => dbConnectionsStore.invalidate(projectId), [projectId]);
  const note = useQuery(["DbFailureDialog.note", projectId, c.note_path], () => (c.note_path ? api.note(projectId, c.note_path) : Promise.resolve(null)), { keepPrevious: true });
  const then = (run: () => void) => () => {
    dialog.close();
    run();
  };

  const [noteError, setNoteError] = useState<string>();
  const appendFix = async () => {
    if (!c.note_path) return;
    setNoteError(undefined);
    try {
      if (await appendFixToNote(projectId, c.note_path, error)) note.reload();
    } catch (e) {
      setNoteError(errorMessage(e));
    }
  };

  return (
    <dialog ref={dialogRef} className="dialog app-dialog db-failure-dialog" aria-label="つながらないときの案内" onClose={onClose}>
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
        <section className="db-failure-note">
          <div className="db-failure-note-head">
            <StickyNote size={14} aria-hidden />
            <span>手順ノート</span>
            {c.note_path && <span className="muted small">{c.note_path}</span>}
            <span className="db-failure-note-tools">
              {c.note_path ? (
                <>
                  <button type="button" className="btn btn-sm" disabled={!note.data} onClick={() => void appendFix()} data-tip="つながったら、何をしたら直ったかを手順ノートに 1 行足す">
                    <NotebookPen size={13} aria-hidden /> 直し方を追記…
                  </button>
                  <button type="button" className="btn btn-sm" onClick={then(onNote)}>
                    開く
                  </button>
                </>
              ) : (
                <button type="button" className="btn btn-sm" onClick={then(onNote)}>
                  手順ノートを作る…
                </button>
              )}
            </span>
          </div>
          <ErrorText message={noteError} />
          {!c.note_path && <p className="small muted">つなぐ前にやること・直し方を残しておくと、次につながらないときにここに出ます。</p>}
          {c.note_path && note.loading && <p className="small muted">読み込み中…</p>}
          {c.note_path && note.error && <p className="small muted">手順ノートが見つかりません（名前を変えた・消したなら、接続の編集で選び直してください）</p>}
          {note.data && (
            <div className="db-failure-note-body">
              <Markdown>{note.data.content}</Markdown>
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
