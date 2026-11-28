// 更新の様子の移り変わり（純粋な関数。出来事から次の様子を決める。electron-updater を動かすのは updater.ts）
import { hasUpdateVersion } from "@shared/updates/state";
import type { UpdateState } from "@shared/updates/types";

/** 更新の出来事（manual は、メニューの「アップデートを確認…」・設定のボタンから手で確かめたか） */
export type UpdateEvent =
  | { type: "checkStarted"; manual: boolean }
  /** 新しい版が見つかった（skipped は「この版は飛ばす」を選んだ版） */
  | { type: "found"; version: string; manual: boolean; skipped: string | null }
  | { type: "notFound"; manual: boolean }
  /** 確かめられなかった（通信の失敗など） */
  | { type: "checkFailed"; manual: boolean }
  | { type: "progress"; percent: number }
  | { type: "downloaded"; version: string }
  | { type: "downloadFailed" }
  /** ［更新して開き直す］を押した（running はそのときの作業中のチャットの数） */
  | { type: "installRequested"; running: number }
  | { type: "runningChanged"; running: number }
  | { type: "installCancelled" }
  | { type: "installFailed" }
  | { type: "skipped" };

/** 確かめる前の様子（手で確かめている間は previous に入れてある） */
const settled = (s: UpdateState): UpdateState => (s.kind === "checking" ? s.previous : s);

/** 帯に何も出していない（手で確かめた結果だけの）様子 */
const isQuiet = (s: UpdateState) => s.kind === "idle" || s.kind === "latest" || s.kind === "unreachable";

/** 出来事から次の様子を決める（当てはまらない出来事は、いまの様子のまま） */
export function nextUpdateState(state: UpdateState, event: UpdateEvent): UpdateState {
  const base = settled(state);
  switch (event.type) {
    case "checkStarted":
      return event.manual ? { kind: "checking", previous: base } : state;
    case "found":
      // 飛ばした版は、手で確かめたときだけ取りに行く（自動の確かめでは印を消す）
      if (event.skipped === event.version && !event.manual) return { kind: "idle" };
      // 同じ版をもう一度ダウンロードしない
      if (hasUpdateVersion(base) && base.version === event.version && base.kind !== "downloading") return base;
      return { kind: "downloading", version: event.version, percent: 0 };
    case "notFound":
      // 確かめ直したら新しい版がなかった（取り下げられた）: 印を消す
      return event.manual ? { kind: "latest" } : base.kind === "ready" || base.kind === "failed" ? { kind: "idle" } : base;
    case "checkFailed":
      // 通信の失敗は何も出さず、印も消さない。手で確かめて何もなかったときだけ、確かめられなかったと出す
      return event.manual && isQuiet(base) ? { kind: "unreachable" } : base;
    case "progress":
      return state.kind === "downloading" ? { ...state, percent: Math.max(0, Math.min(100, event.percent)) } : state;
    case "downloaded":
      return { kind: "ready", version: event.version };
    case "downloadFailed":
      return state.kind === "downloading" ? { kind: "idle" } : state;
    case "installRequested":
      if (state.kind !== "ready") return state;
      return event.running > 0 ? { kind: "waiting", version: state.version, running: event.running } : { kind: "installing", version: state.version };
    case "runningChanged":
      if (state.kind !== "waiting") return state;
      return event.running > 0 ? { ...state, running: event.running } : { kind: "installing", version: state.version };
    case "installCancelled":
      return state.kind === "waiting" ? { kind: "ready", version: state.version } : state;
    case "installFailed":
      return state.kind === "installing" ? { kind: "failed", version: state.version } : state;
    case "skipped":
      return hasUpdateVersion(base) ? { kind: "idle" } : state;
  }
}
