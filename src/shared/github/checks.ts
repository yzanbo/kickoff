// チェックの成否を CiState 1 つにする（GitHub の REST・GraphQL の status / conclusion、commit status の state、PR のまとめの state。
// GitHub タブのチェック・PR の一覧の印・CI のタブが同じ読み方をする。純粋な関数。テストは checks.test.ts）
import type { CiState } from "./ciTypes";

const lower = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v.toLowerCase() : null);

/** status と conclusion（check run・workflow run・job・step 共通。大文字の GraphQL も）を状態にする（時間切れ・起動の失敗・対応が要るも落ちた） */
export function ciStateOf(status: unknown, conclusion: unknown): CiState {
  if (lower(status) !== "completed") return "pending";
  switch (lower(conclusion)) {
    case "success":
      return "success";
    case "failure":
    case "timed_out":
    case "startup_failure":
    case "action_required":
      return "failure";
    case "cancelled":
      return "cancelled";
    case "skipped":
      return "skipped";
    default:
      return "neutral";
  }
}

/** commit status の state（error / failure / pending / success。GraphQL の expected も）を状態にする */
export function commitStatusState(state: unknown): CiState {
  const s = lower(state);
  if (s === "success") return "success";
  if (s === "failure" || s === "error") return "failure";
  return "pending";
}

/** PR の最新のコミットのまとめ（statusCheckRollup.state）。知らない値・ないときは null（印を出さない） */
export function rollupStateOf(state: unknown): CiState | null {
  switch (lower(state)) {
    case "success":
      return "success";
    case "failure":
    case "error":
      return "failure";
    case "pending":
    case "expected":
      return "pending";
    default:
      return null;
  }
}

/** 状態だけでは分からない終わり方の文 */
const DETAILS: Record<string, string> = { timed_out: "時間切れ", action_required: "対応が要る" };
/** 状態の名前で足りる終わり方 */
const PLAIN = new Set(["success", "failure", "startup_failure", "cancelled", "skipped", "neutral"]);

/** チェックの終わり方の添え書き（時間切れ・対応が要る。状態の名前で足りれば null、知らない値はそのまま） */
export function checkDetail(conclusion: unknown): string | null {
  const c = lower(conclusion);
  if (!c || PLAIN.has(c)) return null;
  return DETAILS[c] ?? c;
}
