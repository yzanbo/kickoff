// 版の互換（@shared/api/version）: このアプリが話す API の版と、読める本体の API の版の下限。
// 本体とアプリは別々に更新されるので、合わなければ「アプリを更新してください」「Mac の Kickoff を更新してください」と出して、壊れずに断る
import { API_MISMATCH_LABELS, apiMismatch, type ApiMismatch, type HostApiVersion } from "@shared/api/version";

/** このアプリが話す API の版（本体の API_VERSION と同じ数から始める） */
export const APP_API_VERSION = 1;

/** このアプリが読める本体の API の版の下限 */
export const MIN_HOST_API_VERSION = 1;

/** 本体の版（hello・/api/status）と比べた結果（通じれば null） */
export const hostMismatch = (host: HostApiVersion): ApiMismatch | null => apiMismatch({ api_version: APP_API_VERSION, min_host_api_version: MIN_HOST_API_VERSION }, host);

export const mismatchLabel = (m: ApiMismatch) => API_MISMATCH_LABELS[m];
