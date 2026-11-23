import "./CoreStatusBand.css";
import { useEffect, useState } from "react";
import { CORE_STATE_LABELS, type CoreState } from "@shared/foundation/ipc";
import { errorMessage } from "@shared/foundation/errors";
import { coreNative } from "./native";

/**
 * Kickoff のコア（別のプロセス）が落ちた・応答しないときの、画面の上の細い帯。
 * 様子はメインプロセスが見張って知らせる（IPC の core.onState）。作り直している間「Kickoff のコアを起動し直しています…」、
 * 作り直すのを止めたら「コアが止まりました［起動し直す］」、応答しなければ「Kickoff のコアが応答しません［起動し直す］［待つ］」。
 * 戻ったら（ready）消える。ブラウザで開いた画面（window.kickoff がない）には出さない
 */
export function CoreStatusBand() {
  const state = useCoreState();
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setError(null), [state]);
  const label = state ? CORE_STATE_LABELS[state] : null;
  if (!state || !label) return null;
  const core = coreNative();
  const act = (fn: (() => Promise<void>) | undefined) => () => void fn?.().catch((e: unknown) => setError(errorMessage(e)));
  return (
    <div className={`core-status-band floating core-${state}`} role="alert">
      {state === "restarting" && <span className="spinner" aria-hidden />}
      <strong>{label}</strong>
      {error && <span className="core-status-error">{error}</span>}
      {(state === "failed" || state === "unresponsive") && (
        <button type="button" className="btn btn-primary" onClick={act(core?.restart)}>
          起動し直す
        </button>
      )}
      {state === "unresponsive" && (
        <button type="button" className="btn" onClick={act(core?.wait)}>
          待つ
        </button>
      )}
    </div>
  );
}

/** いまのコアの様子（読み込んだときに聞き、あとは知らせで変える。Mac のアプリでなければ null） */
function useCoreState(): CoreState | null {
  const [state, setState] = useState<CoreState | null>(null);
  useEffect(() => {
    const core = coreNative();
    if (!core) return;
    let live = true;
    const off = core.onState((status) => {
      live = false;
      setState(status.state);
    });
    // 知らせが先に届いていれば、あとから返った答え（古い）で上書きしない
    void core.state().then(
      (status) => live && setState(status.state),
      () => {},
    );
    return off;
  }, []);
  return state;
}
