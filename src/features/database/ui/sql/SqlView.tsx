import type { SQLNamespace } from "@codemirror/lang-sql";
import { Play, PlayCircle, Square } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import { isReadOnlyStatement, splitStatements, statementAt, type SqlStatement } from "@shared/database/sqlStatements";
import { DB_ENVIRONMENT_LABELS, type DbConnection } from "@shared/database/types";
import { dbApi, dbAt } from "@/features/database/ui/api";
import { useQuery } from "@/foundation/ui/query";
import { useDragSize } from "@/foundation/ui/kit/drag/useDragSize";
import { cx } from "@/foundation/ui/lib/cx";
import { useTabs } from "@/foundation/ui/kit/tabs/useTabs";
import type { DbSqlTab } from "@/features/database/ui/state/dbClientTabs";
import { readSetting } from "@/foundation/ui/storage";
import { deferredSetting } from "@/foundation/ui/storage/deferredSetting";
import { storage } from "@/features/database/ui/storage";
import { SqlAssistButton } from "./SqlAssistButton";
import { SqlConnectionPill } from "./SqlConnectionPill";
import { useDbClient } from "@/features/database/ui/state/dbClientContext";
import { DbWriteBand } from "@/features/database/ui/write/DbWriteBand";
import { SqlEditor, type SqlEditorHandle } from "./SqlEditor";
import { RunMessages, RunResult } from "./SqlRunResult";
import { envSentence, runTabLabel } from "./sqlResultLabels";
import { useSqlRun } from "./useSqlRun";
import { SqlHistoryButton } from "./SqlHistory";
import { useSqlPending } from "@/features/database/ui/state/sqlSessions";
import { useSqlWrite } from "@/features/database/ui/write/useSqlWrite";

/** 結果のタブの「メッセージ」のキー */
const MESSAGES = "messages";

/** 書きかけの SQL を覚えるまでの間（打つたびに書かない） */
const DRAFT_DELAY = 400;

/** SQL のタブ。上に入力欄（⌘↵ でカーソルの文か選んだ範囲、⇧⌘↵ ですべての文）、下に文ごとの結果のタブ。タブごとに DB の接続を 1 本持つ */
export function SqlView({ tab, connection, active }: { tab: DbSqlTab; connection: DbConnection; active: boolean }) {
  const client = useDbClient();
  const worktree = client.worktreeOf(connection.id);
  const draftKey = storage.settings.sqlDraft(`${client.surfaceKey}:${tab.key}`);
  const editor = useRef<SqlEditorHandle | null>(null);
  // 残す: 書きかけは開いたときに 1 回だけ読む（打つたびに読み直して入力欄を戻さない）
  const initial = useMemo(() => readSetting(draftKey), [draftKey]);
  // 書きかけは止まってから書く（窓を閉じる・読み込み直す前には書き出す）。タブを閉じたら消すので、外れたときは書かずに捨てる
  // 残す: 遅らせる書き込みはキーごとに 1 つ（作り直すと待っている書き込みを捨てる）
  const draft = useMemo(() => deferredSetting(draftKey, DRAFT_DELAY), [draftKey]);
  const pending = useSqlPending(tab.key);
  const write = useSqlWrite(connection, pending);
  const { runs, shown, setShown, running, loadingMore, finishing, activity, execute, more, stop, finish } = useSqlRun({ tab, connection, worktree, active, pending, write });
  const { paneRef: heightPaneRef, ...height } = useDragSize<HTMLDivElement>({ setting: storage.settings.sqlEditorHeight, axis: "y", unit: "%", min: 15, max: 85 });

  // 補完に使うテーブルと列（接続の既定の DB・スキーマ）
  const outline = useQuery(["SqlView.outline", connection.id, worktree], () => dbApi("POST /api/projects/:projectId/db-connections/:connectionId/outline", { ...dbAt(client.projectId, connection.id, worktree), body: { path: { database: connection.database, schema: null } } }), { keepPrevious: true });
  const schema: SQLNamespace | undefined = outline.data ? Object.fromEntries(outline.data.map((t) => [t.name, t.columns])) : undefined;

  const saveDraft = (text: string) => {
    activity();
    draft.write(text);
  };
  useEffect(() => () => draft.cancel(), [draft]);

  /** 流す文を決める（選んだ範囲があればその中の文、all ならすべて、そうでなければカーソルの文） */
  const pickStatements = (all: boolean): SqlStatement[] => {
    const handle = editor.current;
    if (!handle) return [];
    const text = handle.text();
    const sel = handle.selection();
    if (!sel.empty) return splitStatements(text.slice(sel.from, sel.to), connection.engine);
    const statements = splitStatements(text, connection.engine);
    if (all) return statements;
    const one = statementAt(statements, sel.from);
    return one ? [one] : [];
  };

  const run = (all: boolean) => void execute(pickStatements(all));

  const current = runs[shown];
  // 結果のタブ（文ごと ＋ メッセージ）。←→ で移る
  const resultTabs = useTabs({
    keys: [...runs.map((_, i) => String(i)), MESSAGES],
    value: shown === runs.length ? MESSAGES : String(shown),
    onChange: (key) => setShown(key === MESSAGES ? runs.length : Number(key)),
    label: "文ごとの結果",
  });

  return (
    <div className={cx("db-sql-view", `db-env-${connection.environment}`, write.on && "writing")}>
      {write.on && (
        <DbWriteBand
          connection={connection}
          what="流す"
          blocked={pending ? "コミットか取り消しのあとに戻せます" : running ? "流し終わってから戻せます" : null}
          onRevert={write.revert}
        />
      )}
      <div ref={heightPaneRef} className="db-sql-top" style={{ height: `${height.size}%` }}>
        <div className="db-sql-toolbar bar">
          <SqlConnectionPill connection={connection} tabKey={tab.key} disabled={running || write.on} />
          <button type="button" className="btn" data-size="sm" disabled={running} onClick={() => run(false)} data-tip="カーソルの文か、選んだ範囲を流す" data-tip-keys="⌘↵">
            <Play size={13} aria-hidden /> 流す
          </button>
          <button type="button" className="btn" data-size="sm" disabled={running} onClick={() => run(true)} data-tip="すべての文を順に流す（失敗した文で止める）" data-tip-keys="⇧⌘↵">
            <PlayCircle size={13} aria-hidden /> すべて流す
          </button>
          {running && (
            <button type="button" className="btn btn-danger" data-size="sm" onClick={stop}>
              <Square size={12} aria-hidden /> 止める
            </button>
          )}
          <SqlHistoryButton connection={connection} onPick={(sql) => editor.current?.append(sql)} />
          <SqlAssistButton connection={connection} editor={editor} />
          <span className="db-sql-spacer" />
          <span className={cx("db-sql-env tag small", `db-env-${connection.environment}`)}>
            <span className="db-env-dot" aria-hidden />
            {DB_ENVIRONMENT_LABELS[connection.environment]}
          </span>
          {connection.read_only && !write.on && (
            <>
              <span className="db-sql-readonly tag small">読み取り専用</span>
              <button
                type="button"
                className="btn"
                data-size="sm"
                disabled={running || pending}
                onClick={() => void write.start()}
                data-tip={pending ? "コミットか取り消しのあとに外せます" : "このタブだけ読み取り専用を外す（環境の名前を入れて確かめます。接続の設定は変えません）"}
              >
                書き込む
              </button>
            </>
          )}
          {pending && (
            <span className="db-sql-pending small">
              コミットしていない変更があります
              <button type="button" className="btn btn-primary" data-size="sm" disabled={finishing || running} onClick={() => void finish("commit")}>
                コミット
              </button>
              <button type="button" className="btn" data-size="sm" disabled={finishing || running} onClick={() => void finish("rollback")}>
                取り消す
              </button>
            </span>
          )}
        </div>
        <SqlEditor
          engine={connection.engine}
          initialValue={initial}
          schema={schema}
          onChange={saveDraft}
          onRun={() => run(false)}
          onRunAll={() => run(true)}
          handleRef={editor}
        />
      </div>
      <div className="pane-resizer db-sql-resizer" {...height.handle} />
      <div className="db-sql-results">
        {runs.length > 0 && (
          <div className="db-result-tabs bar" {...resultTabs.listProps}>
            {runs.map((r, i) => (
              <button key={i} type="button" {...resultTabs.tabProps(String(i))} className={cx("db-result-tab", i === shown && "active", r.error && "failed", r.skipped && "skipped")} title={r.sql}>
                {runTabLabel(r, i)}
              </button>
            ))}
            {/* 文ごとの結果を並べた「メッセージ」（shown が runs.length のとき） */}
            <button type="button" {...resultTabs.tabProps(MESSAGES)} className={cx("db-result-tab", shown === runs.length && "active")}>
              メッセージ
            </button>
          </div>
        )}
        {running && runs.length === 0 && <p className="db-sql-note small muted">流しています…</p>}
        {!running && runs.length === 0 && <p className="db-sql-note small muted">結果はここに出ます。</p>}
        {runs.length > 0 && shown === runs.length && <RunMessages runs={runs} onPick={setShown} />}
        {current && (
          <RunResult
            run={current}
            env={envSentence(connection)}
            canMore={!running && isReadOnlyStatement(current.sql, connection.engine)}
            loadingMore={loadingMore}
            onMore={() => void more(shown)}
          />
        )}
      </div>
    </div>
  );
}
