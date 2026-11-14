import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import type { OrphanSession } from "@shared/types";
import { formatSize } from "@shared/attachment/truncate";
import { api } from "@/api";
import { useAction } from "@/hooks/useAction";
import { ErrorText } from "@/ui/ErrorText";
import { confirmDialog } from "@/ui/dialogs";
import { showToast } from "@/ui/toast";
import { formatDayTime } from "@/lib/time";

/**
 * どのチャットも使っていない会話記録（メモの仕様書「ファイル削除」の Q17 の「いまある分」）。前からある会話記録は、ターミナルで直接使った Claude Code の
 * 記録と見分けられないので自動では消さず、「探す」を押したら日付・大きさ・最初の発言・作業フォルダの一覧を出し、選んだものだけを Kickoff のゴミ箱へ入れる
 */
export function OrphanSessions() {
  const [list, setList] = useState<OrphanSession[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const { busy, error, run } = useAction();
  const pickedSize = useMemo(() => (list ?? []).filter((s) => picked.has(s.session_id)).reduce((sum, s) => sum + s.size, 0), [list, picked]);
  const search = () =>
    run("search", async () => {
      setList(await api.orphanSessions());
      setPicked(new Set());
    });
  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const trash = () =>
    run("trash", async () => {
      const ok = await confirmDialog({
        title: `会話記録 ${picked.size} 件（${formatSize(pickedSize)}）をゴミ箱に入れますか？`,
        message: "3 日はゴミ箱から戻せ、3 日たつと本当に消えます。ターミナルで直接使った Claude Code の記録も一覧に出るので、続けたいものは選ばないでください。",
        confirmLabel: "ゴミ箱に入れる",
        danger: true,
      });
      if (!ok) return;
      const result = await api.trashOrphanSessions([...picked]);
      showToast(`会話記録 ${result.trashed} 件をゴミ箱に入れました（作業フォルダのプロジェクトの「ゴミ箱」、なければ下の「プロジェクトのないもの」から戻せます）`);
      setList(await api.orphanSessions());
      setPicked(new Set());
    });
  const total = (list ?? []).reduce((sum, s) => sum + s.size, 0);
  // Kickoff の 1 回だけの問い合わせ（チャットの名前付け・要約など）の記録。前の版が残したもので、続けることはないので、まとめて選べるようにする
  const asks = (list ?? []).filter((s) => s.kickoff_ask);
  return (
    <section className="section">
      <h2>どのチャットも使っていない会話記録</h2>
      <p className="muted small">
        Claude Code の会話記録（~/.claude/projects）のうち、Kickoff のどのチャットも使っていないものです。Kickoff を作り直す前のチャット・前に削除したチャットの記録のほか、ターミナルで直接使った
        Claude Code の記録も同じ形で入っているので、自動では消しません。選んだものだけをゴミ箱に入れます（これから Kickoff が作る会話記録は、使われなくなったら自動でゴミ箱に入ります）。
      </p>
      <div className="orphan-sessions-head">
        <button type="button" className="btn btn-sm" disabled={busy !== null} onClick={() => void search()}>
          <Search size={14} aria-hidden />
          {busy === "search" ? "探しています…" : list ? "探し直す" : "探す"}
        </button>
        {list && <span className="muted small">{list.length === 0 ? "見つかりませんでした" : `${list.length} 件・合計 ${formatSize(total)}`}</span>}
        {list && list.length > 0 && (
          <>
            <button type="button" className="link-button" onClick={() => setPicked(picked.size === list.length ? new Set() : new Set(list.map((s) => s.session_id)))}>
              {picked.size === list.length ? "すべて外す" : "すべて選ぶ"}
            </button>
            {asks.length > 0 && (
              <button
                type="button"
                className="link-button"
                title="チャットの名前付け・要約など、Kickoff が 1 回だけ問い合わせたときの記録です（前の版が残したもので、続けることはありません）"
                onClick={() => setPicked(new Set(asks.map((s) => s.session_id)))}
              >
                Kickoff の問い合わせの記録を選ぶ（{asks.length} 件・{formatSize(asks.reduce((sum, s) => sum + s.size, 0))}）
              </button>
            )}
            <button type="button" className="btn btn-danger btn-sm" disabled={picked.size === 0 || busy !== null} onClick={() => void trash()}>
              選んだ {picked.size} 件{picked.size > 0 ? `（${formatSize(pickedSize)}）` : ""}をゴミ箱に入れる
            </button>
          </>
        )}
      </div>
      <ErrorText message={error} />
      {list && list.length > 0 && (
        <ul className="orphan-sessions">
          {list.map((s) => (
            <li key={s.session_id}>
              <label className="orphan-session">
                <input type="checkbox" checked={picked.has(s.session_id)} onChange={() => toggle(s.session_id)} />
                <span className="orphan-session-main">
                  <span className="orphan-session-prompt">
                    {s.kickoff_ask && <span className="orphan-session-tag">Kickoff の問い合わせ</span>}
                    {s.first_prompt ?? "（最初の発言なし）"}
                  </span>
                  <span className="muted small orphan-session-meta">
                    <span title={new Date(s.modified_at).toLocaleString()}>{formatDayTime(s.modified_at)}</span>
                    <span>{formatSize(s.size)}</span>
                    <span className="orphan-session-cwd" title={s.cwd ?? undefined}>
                      {s.cwd ?? "作業フォルダ不明"}
                    </span>
                  </span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
