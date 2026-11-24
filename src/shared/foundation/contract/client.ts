// 取り決めの呼び手の芯（純粋）。画面の呼び手（fetch・失敗の扱いを足す）・スマホ・テストの call が、この上に作る
import { splitKey, type Contract, type Method, type RouteInput, type RouteKey, type RouteKind, type RouteOutput } from "./route";

/** 送る頼み（path は :name を埋め、クエリを付けたもの） */
export interface SendRequest {
  method: Method;
  path: string;
  kind: RouteKind;
  body?: unknown;
}

/** 入力の引数（入力のないルートは省ける。中身がすべて省けるなら入力も省ける） */
export type ClientArgs<I, O> = [I] extends [undefined] ? [input?: undefined, options?: O] : {} extends I ? [input?: I, options?: O] : [input: I, options?: O];

type Input = { params?: Record<string, string | number>; query?: Record<string, unknown>; body?: unknown };

/** 取り決めから型付きの呼び手を作る（送り方 send は呼ぶ側が決める） */
export function createClient<C extends Contract, O = undefined>(contract: C, send: (req: SendRequest, options: O | undefined) => Promise<unknown>) {
  return <K extends RouteKey<C>>(key: K, ...args: ClientArgs<RouteInput<C, K>, O>): Promise<RouteOutput<C, K>> => {
    const [input, options] = args as [Input | undefined, O | undefined];
    const spec = contract[key];
    if (!spec) throw new Error(`取り決めにないルートです: ${key}`);
    const req: SendRequest = { method: splitKey(key).method, path: urlOf(key, input), kind: spec.kind };
    if (input?.body !== undefined) req.body = input.body;
    return send(req, options) as Promise<RouteOutput<C, K>>;
  };
}

/** キーと入力から URL のパスを作る（:name は値を符号化して埋め、* は段ごとに符号化する。クエリは値のない項目を付けない・真偽値は "1" / "0"・並びは同じ名前を重ねる） */
export function urlOf(key: string, input?: Input): string {
  const params = input?.params ?? {};
  const path = splitKey(key)
    .path.split("/")
    .map((part) => {
      if (part === "*") return String(params["*"] ?? "").split("/").map(encodeURIComponent).join("/");
      if (!part.startsWith(":")) return part;
      const value = params[part.slice(1)];
      if (value === undefined) throw new Error(`パスの引数がありません: ${part}（${key}）`);
      return encodeURIComponent(String(value));
    })
    .join("/");
  const search = new URLSearchParams();
  for (const [name, value] of Object.entries(input?.query ?? {})) {
    for (const v of Array.isArray(value) ? value : [value]) {
      if (v === undefined || v === null || v === "") continue;
      search.append(name, typeof v === "boolean" ? (v ? "1" : "0") : String(v));
    }
  }
  const text = search.toString();
  return text ? `${path}?${text}` : path;
}

/** access が端末に開いたルートのキー（スマホの呼び手はこれで作る） */
export type DeviceRouteKey<C extends Contract> = { [K in RouteKey<C>]: C[K] extends { readonly access: "device" | "deviceRead" } ? K : never }[RouteKey<C>];

/** 端末に開いたルートだけの取り決め（型でも選ぶ） */
export function deviceRoutesOf<C extends Contract>(contract: C): Pick<C, DeviceRouteKey<C>> {
  return Object.fromEntries(Object.entries(contract).filter(([, spec]) => spec?.access === "device" || spec?.access === "deviceRead")) as Pick<C, DeviceRouteKey<C>>;
}
