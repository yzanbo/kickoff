// 取り決め（@shared/<機能>/contract.ts）から型付きで API を呼ぶ口。URL の組み立て・入力の詰め方は @shared/foundation/contract の createClient、
// ここは送り方（fetch・本文の形・応答の読み方）と、失敗の code ごとのやり直し・keepalive・つながらないときの coreDown を足す
import { createClient, urlOf, type ClientArgs, type Contract, type FormBody, type RouteInput, type RouteKey, type RouteOutput, type SendRequest } from "@shared/foundation/contract";
import { ApiError, bodyOf, failure, send } from "./http";

/** 1 回の呼び出しの選択肢 */
export interface CallOptions {
  /** 窓を閉じる・読み込み直す間際にも届ける（pagehide） */
  keepalive?: boolean;
  signal?: AbortSignal;
}

/** その取り決めの呼び手に 1 回付ける選択肢 */
export interface ClientOptions {
  /** 失敗の code ごとの口（409 で利用者に聞いてやり直す など）。retry を呼べば同じ要求をもう一度送る。投げれば失敗のまま */
  onError?: Readonly<Record<string, (error: ApiError, retry: () => Promise<unknown>) => Promise<unknown>>>;
  /** 呼ぶ口の差し替え（既定は window の fetch） */
  fetch?: typeof fetch;
}

/** form の本文（Blob・File はそのまま、ほかは文字にして FormData に入れる。undefined・null の項目は送らない） */
type FormFields = Readonly<Record<string, Blob | string | number | boolean | null | undefined>>;
/** blob の応答 */
interface BlobResult {
  blob: Blob;
  headers: Headers;
}
/** 画面から渡す入力（form の本文は印の FormBody でなく項目の表） */
type Input<C extends Contract, K extends RouteKey<C>> = RouteInput<C, K> extends infer I ? (I extends { body: FormBody } ? Omit<I, "body"> & { body: FormFields } : I) : never;

/** 取り決めの呼び手（画面）。呼び出しの形は 呼び出し(キー, { params, query, body }, 選択肢) */
export interface ApiClient<C extends Contract> {
  /** json は JSON を送り JSON を返す（204 は undefined）・form は本文を FormData にして送る・blob は { blob, headers } を返す。sse・ws・raw は呼べない（url を使う） */
  <K extends RouteKey<C>>(route: K, ...args: ClientArgs<Input<C, K>, CallOptions>): Promise<RouteOutput<C, K, BlobResult>>;
  /** URL だけを作る（sse は EventSource、blob は <img src>・ダウンロード） */
  url<K extends RouteKey<C>>(route: K, input?: RouteInput<C, K>): string;
}

export function client<C extends Contract>(contract: C, options: ClientOptions = {}): ApiClient<C> {
  const call = createClient<C, CallOptions>(contract, (req, callOptions) => run(req, callOptions ?? {}, options));
  return Object.assign(call, { url: urlOf }) as unknown as ApiClient<C>;
}

/** 送って応答を読む（失敗の code に口があれば、その口の結果を呼び出しの結果にする） */
async function run(req: SendRequest, callOptions: CallOptions, { onError, fetch: fetchImpl }: ClientOptions): Promise<unknown> {
  const attempt = async (): Promise<unknown> => {
    const res = await send(req.path, init(req, callOptions), fetchImpl);
    if (req.kind !== "blob") return bodyOf(res);
    if (!res.ok) throw await failure(res);
    return { blob: await res.blob(), headers: res.headers } satisfies BlobResult;
  };
  try {
    return await attempt();
  } catch (e) {
    const handler = e instanceof ApiError && e.code !== undefined ? onError?.[e.code] : undefined;
    if (!handler) throw e;
    return handler(e as ApiError, attempt);
  }
}

function init(req: SendRequest, { keepalive = false, signal }: CallOptions): RequestInit {
  if (req.kind === "sse" || req.kind === "ws" || req.kind === "raw") throw new Error(`${req.kind} のルートは呼べません（url を使う）: ${req.method} ${req.path}`);
  const base: RequestInit = { method: req.method, credentials: "same-origin", keepalive, signal };
  if (req.body === undefined) return base;
  if (req.kind === "form") return { ...base, body: formData(req.body as FormFields) };
  return { ...base, headers: { "content-type": "application/json" }, body: JSON.stringify(req.body) };
}

function formData(fields: FormFields): FormData {
  const form = new FormData();
  for (const [name, value] of Object.entries(fields)) {
    if (value === undefined || value === null) continue;
    form.append(name, value instanceof Blob ? value : String(value));
  }
  return form;
}
