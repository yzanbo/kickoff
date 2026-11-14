// 版の互換: Mac の Kickoff（本体）とスマホのアプリは別々に更新されるので、やり取りの形の番号（API の版）で話が通じるかを見分ける。
// API の版は Kickoff の版とは別に持ち、スマホとのやり取りの形を壊す変更をしたときだけ 1 つ上げる（2026-11-14 に利用者と決めた）。
// 本番のリリース（1.0）からは、変更は「足すだけ」（項目を消さない・名前を変えない・意味を変えない）にし、壊す変更をするときだけ版を上げる。
// 0.x の間は壊す変更をしてよいが、版の確かめはいまから入れておく

/** いまの API の版 */
export const API_VERSION = 1;

/** 本体が受けるアプリの API の版の下限（これより古いアプリは断る。いまはスマホのアプリがないので、どれも断らない） */
export const MIN_CLIENT_API_VERSION = 1;

/** アプリが自分の API の版を伝える見出し（ない頼みは断らない。この Mac の画面は本体と同じ版なので付けない） */
export const API_VERSION_HEADER = "x-kickoff-api";

/** 話が通じないときの印（断るときの応答の code・アプリが hello から決めるとき） */
export const API_MISMATCHES = ["client_too_old", "host_too_old"] as const;
export type ApiMismatch = (typeof API_MISMATCHES)[number];

/** 利用者に出す文 */
export const API_MISMATCH_LABELS: Record<ApiMismatch, string> = {
  client_too_old: "アプリを更新してください（Mac の Kickoff のほうが新しく、このアプリでは読めません）",
  host_too_old: "Mac の Kickoff を更新してください（このアプリのほうが新しく、Mac の Kickoff では読めません）",
};

/** 本体が知らせる版（SSE の最初の hello・/api/status） */
export interface HostApiVersion {
  api_version: number;
  min_client_api_version: number;
}

/**
 * 話が通じるか（通じれば null）。アプリは自分の API の版と、自分が読める本体の版の下限を持ち、本体の hello と比べる。
 * 本体は、アプリが見出しで伝えた版だけで client_too_old を決める（host_too_old はアプリが決める）
 */
export function apiMismatch(client: { api_version: number; min_host_api_version: number }, host: HostApiVersion): ApiMismatch | null {
  if (client.api_version < host.min_client_api_version) return "client_too_old";
  if (host.api_version < client.min_host_api_version) return "host_too_old";
  return null;
}
