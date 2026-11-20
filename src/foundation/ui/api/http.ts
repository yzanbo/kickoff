// サーバー（コアの HTTP API）とのやり取りの土台。資源ごとの関数（api/<資源>.ts）はどれもここを通す
// （URL のクエリの組み立て・失敗の扱いはここだけに書く）
import { CORE_DOWN_SEND_MESSAGE } from "@shared/foundation/ipc";

/** API の失敗。status は HTTP の状態コード、message はサーバーが返した文（読めなければ「HTTP 500」など） */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    /** サーバーが付けた失敗の種類の印（DB クライアントの「このワークツリーにはありません」など。なければ undefined） */
    readonly code?: string,
  ) {
    super(message);
  }
}

/** コアにつながらなかった（コアのプロセスを作り直している・止まった・単体のコアが動いていない）印。status は 0 */
const CORE_DOWN = "core_down";

/**
 * コアにつながらなかった失敗（送った文は呼ぶ側が残す）。Mac のアプリではコアのプロセスを作り直している間のこと（帯と同じ言葉）。
 */
function coreDown(status = 0): ApiError {
  const message = typeof window !== "undefined" && window.kickoff ? CORE_DOWN_SEND_MESSAGE : "Kickoff につながりません。少し待ってからもう一度送ってください";
  return new ApiError(status, message, CORE_DOWN);
}

/** fetch（つながらなければ coreDown。止めた頼み（AbortError）はそのまま投げる）。send・failure・bodyOf は同じフォルダの client.ts も使う */
export async function send(url: string, init: RequestInit, fetchImpl: typeof fetch = fetch): Promise<Response> {
  try {
    return await fetchImpl(url, init);
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    throw coreDown();
  }
}

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/** クエリ（値が undefined・null・空の文字の項目は付けない。真偽値は "1" / "0"、数は文字にする） */
export type Query = Record<string, string | number | boolean | null | undefined>;

/** パスにクエリを付ける（API の URL のクエリは、すべてこれで組み立てる） */
export function withQuery(path: string, query: Query): string {
  const params = new URLSearchParams();
  for (const [name, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;
    params.set(name, typeof value === "boolean" ? (value ? "1" : "0") : String(value));
  }
  const text = params.toString();
  return text ? `${path}?${text}` : path;
}

/** 失敗の応答を ApiError にする（サーバーは { error: 文 } で返す。本文が読めなければ状態コードだけ） */
export async function failure(res: Response): Promise<ApiError> {
  const data = (await res.json().catch(() => null)) as { error?: unknown; code?: unknown } | null;
  // コアは失敗をいつも JSON で返すので、JSON でない 5xx はコアの手前（開発時の Vite の転送）がつなげなかったもの
  if (!data) return res.status >= 500 ? coreDown(res.status) : new ApiError(res.status, `HTTP ${res.status}`);
  return new ApiError(res.status, typeof data.error === "string" ? data.error : `HTTP ${res.status}`, typeof data.code === "string" ? data.code : undefined);
}

/** 応答の本文（返すもののない応答（204）は undefined） */
export async function bodyOf<T>(res: Response): Promise<T> {
  if (!res.ok) throw await failure(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** API を呼ぶ（body は JSON で送る。失敗は ApiError。keepalive は窓を閉じる・読み込み直す間際にも届けたいとき） */
export async function request<T>(method: Method, url: string, body?: unknown, { keepalive = false }: { keepalive?: boolean } = {}): Promise<T> {
  const res = await send(url, {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: "same-origin",
    keepalive,
  });
  return bodyOf<T>(res);
}

/** multipart（FormData）で送る（添付ファイル・音声。失敗は ApiError） */
export async function postForm<T>(url: string, form: FormData): Promise<T> {
  const res = await send(url, { method: "POST", body: form, credentials: "same-origin" });
  return bodyOf<T>(res);
}

/** ファイルの中身（画像など）を読む（本文と応答のヘッダー。失敗は ApiError） */
export async function requestBlob(url: string): Promise<{ blob: Blob; headers: Headers }> {
  const res = await send(url, { credentials: "same-origin" });
  if (!res.ok) throw await failure(res);
  return { blob: await res.blob(), headers: res.headers };
}

/** JSON を送って、本文をそのまま受け取る（読み上げの音声など。失敗は ApiError） */
export async function postForBlob(url: string, body: unknown, signal?: AbortSignal): Promise<Blob> {
  const res = await send(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), credentials: "same-origin", signal });
  if (!res.ok) throw await failure(res);
  return res.blob();
}
