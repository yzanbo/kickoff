import { Play, RotateCcw, ShieldAlert, Square } from "lucide-react";
import { useEffect, useState } from "react";
import { errorMessage } from "@shared/errors";
import { DB_PREP_KIND_LABELS, type DbConnection, type DbPrepKind, type DbPrepState } from "@shared/types";
import { api } from "@/api";
import { useAsync } from "@/hooks/useAsync";
import { useModalDialog } from "@/hooks/useModalDialog";
import { formatDayTime, relativeTime } from "@/lib/time";
import { dbConnectionsStore } from "@/stores/dbConnections";
import { DialogActions } from "@/ui/DialogActions";
import { ErrorText } from "@/ui/ErrorText";
import { StatusDot } from "@/ui/StatusDot";

/** 流している間の様子を読み直す間隔 */
const POLL_MS = 500;
/** 見せる記録の数 */
const RUNS_SHOWN = 10;

const STEP_TONE = { running: "pending", ok: "ok", failed: "ng" } as const;

/**
 * つなぐ前の準備（接続の右クリック・つながらないときの案内・確かめていないときの木の失敗の行から）: 登録したコマンドを種類ごとに見せ、
 * 確かめていなければ確かめさせてから、準備のコマンドを流して様子（コマンドごとの成否と出力）を出す。下にこれまでの記録（成否だけ）
 */
export function DbPrepDialog({
  projectId,
  connection: c,
  onRetry,
  onClose,
}: {
  projectId: number;
  connection: DbConnection;
  /** 開いていた段を読み直す（済んだら「つなぎ直す」。なければ出さない） */
  onRetry?: () => void;
  onClose: () => void;
}) {
  const dialog = useModalDialog({ closeOnBackdrop: false });
  const [state, setState] = useState<DbPrepState | null>(null);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const runs = useAsync(() => api.dbPrepRuns(projectId, c.id), [projectId, c.id, state?.finished_at]);
  const prep = c.prep;
  const hasPrepare = (prep?.prepare.length ?? 0) > 0;
  const running = state?.running ?? false;

  // 開いたら前の様子を読み（流している途中なら続きを見せる）、流している間は読み直す
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      try {
        const next = await api.dbPrepState(projectId, c.id);
        if (!alive) return;
        setState(next);
        if (next?.running) timer = setTimeout(() => void poll(), POLL_MS);
      } catch (e) {
        if (alive) setError(errorMessage(e));
      }
    };
    if (running || state === null) void poll();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, c.id, running]);

  /** 確かめていなければ確かめてから（then: 確かめたあとにすること） */
  const act = async (then: () => Promise<void>) => {
    setBusy(true);
    setError(undefined);
    try {
      if (!c.prep_confirmed) {
        await api.confirmDbPrep(projectId, c.id);
        dbConnectionsStore.invalidate(projectId);
      }
      await then();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const start = () =>
    act(async () => {
      await api.prepareDb(projectId, c.id);
      setState({ running: true, steps: [], error: null, finished_at: null });
    });

  const retry = () => {
    dialog.close();
    onRetry?.();
  };

  const done = state !== null && !state.running && state.finished_at !== null;
  const succeeded = done && state.error === null && state.steps.every((s) => s.status === "ok");
  const groups = prep
    ? ([
        { kind: "prepare", commands: prep.prepare },
        { kind: "cleanup", commands: prep.cleanup },
        { kind: "tunnel", commands: prep.tunnel ? [prep.tunnel] : [] },
        { kind: "password", commands: prep.password ? [prep.password] : [] },
      ] satisfies { kind: DbPrepKind; commands: string[] }[]).filter((g) => g.commands.length > 0)
    : [];

  return (
    <dialog ref={dialog.ref} className="dialog app-dialog db-prep-dialog" aria-label="つなぐ前の準備" onClose={onClose}>
      <div className="app-dialog-body">
        <h2 className="app-dialog-title">「{c.name}」のつなぐ前の準備</h2>
        {groups.length === 0 && <p className="small muted">この接続には準備のコマンドがありません。接続の編集の「つなぐ前にコマンドを流す」で登録できます。</p>}
        {groups.map((g) => (
          <section key={g.kind} className="db-prep-group">
            <h3 className="db-prep-group-title">{DB_PREP_KIND_LABELS[g.kind]}</h3>
            <pre className="db-prep-commands">{g.commands.join("\n")}</pre>
          </section>
        ))}
        {prep && !c.prep_confirmed && (
          <p className="db-prep-warning small">
            <ShieldAlert size={14} aria-hidden />
            <span>
              このコマンドはまだ確かめていません。この Mac のログインシェルで、あなたの権限で流れます。中身を読んで、流してよいものか確かめてください（中身を変えたら確かめ直します）。
            </span>
          </p>
        )}
        {state && (state.steps.length > 0 || state.error) && (
          <section className="db-prep-run" aria-live="polite">
            {state.steps.map((step, i) => (
              <div key={i} className="db-prep-step">
                <div className="db-prep-step-head">
                  <StatusDot tone={STEP_TONE[step.status]} />
                  <code>{step.command}</code>
                  <span className="muted small">{step.status === "running" ? "流しています…" : step.status === "ok" ? "済み" : "失敗"}</span>
                </div>
                {step.output.trim() && <pre className="db-prep-output">{step.output.trimEnd()}</pre>}
              </div>
            ))}
            {state.error && <ErrorText message={state.error} />}
            {succeeded && <p className="small db-prep-done">準備が済みました。{prep?.cleanup.length ? "後片付けのコマンドは、この接続を切るときに流します。" : ""}</p>}
          </section>
        )}
        {runs.data && runs.data.length > 0 && (
          <section className="db-prep-history">
            <h3 className="db-prep-group-title">これまでの記録</h3>
            <ul>
              {runs.data.slice(0, RUNS_SHOWN).map((r) => (
                <li key={r.id}>
                  <StatusDot tone={r.ok ? "ok" : "ng"} />
                  <span className="db-prep-history-kind">{DB_PREP_KIND_LABELS[r.kind]}</span>
                  <code>{r.command}</code>
                  <span className="muted" title={formatDayTime(r.ran_at)}>
                    {relativeTime(r.ran_at)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
        <ErrorText message={error} />
        <DialogActions>
          <button type="button" className="btn" onClick={() => dialog.close()}>
            閉じる
          </button>
          {running ? (
            <button type="button" className="btn" onClick={() => void api.cancelDbPrep(projectId, c.id).catch((e: unknown) => setError(errorMessage(e)))}>
              <Square size={14} aria-hidden /> 止める
            </button>
          ) : succeeded && onRetry ? (
            <button type="button" className="btn btn-primary" onClick={retry}>
              <RotateCcw size={14} aria-hidden /> つなぎ直す
            </button>
          ) : hasPrepare ? (
            <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void start()}>
              <Play size={14} aria-hidden /> {c.prep_confirmed ? (done ? "もう一度流す" : "流す") : "確かめて流す"}
            </button>
          ) : (
            prep &&
            (!c.prep_confirmed || onRetry) && (
              // つなぐときのコマンドだけ: 確かめたら、つなぎ直す
              <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void act(async () => retry())}>
                {c.prep_confirmed ? "つなぎ直す" : "確かめてつなぐ"}
              </button>
            )
          )}
        </DialogActions>
      </div>
    </dialog>
  );
}
