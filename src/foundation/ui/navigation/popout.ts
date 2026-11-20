// 別ウィンドウ（チャットの画面の右の欄の変更・ファイル・サブエージェント・子チャット・ノート・DB クライアント、左のサイドバー、
// 右端のチャット欄とそのブラウザ・ターミナルのタブを、メインのウィンドウの外に出して見る）の行き先。
// 種類は持ち主の機能が ui/popoutKinds.ts で PopoutParamsMap に足し、URL の項目の表を popoutKinds に入れる
import { definePoint } from "@/foundation/ui/points";
import { postWindowMessage } from "./windowBus";

/** 機能が足していく別ウィンドウの種類の表（declare module "@/foundation/ui/navigation/popout" で足す。値は URL に載せる項目） */
export interface PopoutParamsMap {}
type PopoutKindId = keyof PopoutParamsMap & string;
/** 別ウィンドウで開くもの（どの種類も、持ち主の機能の ui/popoutKinds.ts に中身の説明がある） */
export type PopoutRoute = { [K in PopoutKindId]: { kind: K } & PopoutParamsMap[K] }[PopoutKindId];

/**
 * URL の項目の読み書き。string: 要る（空は読めない）・string?: なくてよい（空なら書かない）・text: 要る（空でもよい）・
 * number: 要る（1 以上の整数）・number?: なくてよい・number|null: なければ null・strings?: 文字の表（JSON。読めなければ付けない）
 */
type FieldKind = "string" | "string?" | "text" | "number" | "number?" | "number|null" | "strings?";
/** param は URL の名前（省けば項目の名前）、fallback は text がないときの値 */
interface FieldSpec {
  kind: FieldKind;
  param?: string;
  fallback?: string;
}
export interface PopoutKind<K extends PopoutKindId = PopoutKindId> {
  kind: K;
  /** URL の項目（書く順に並べる。path と parse をこの表から作る。同じものは同じ文字になり、メインプロセスが同じウィンドウを前に出す） */
  fields: { readonly [F in keyof PopoutParamsMap[K]]-?: FieldKind | FieldSpec };
  /** 同じウィンドウかを見るときに外す項目（変更の移るファイルなど） */
  keyIgnores?: readonly (keyof PopoutParamsMap[K] & string)[];
}
/** 別ウィンドウの種類（key は kind。表は app/renderer/popout/contributes.ts が出す） */
export const popoutKinds = definePoint<{ [K in PopoutKindId]: PopoutKind<K> }[PopoutKindId]>("popoutKinds", { key: (k) => k.kind });

const PREFIX = "/popout/";
const INVALID = Symbol("invalid");

/** 種類の URL の項目（項目の名前・読み書きの仕方・URL の名前） */
function fieldsOf(name: string): { name: string; kind: FieldKind; param: string; fallback?: string }[] | undefined {
  const kind = popoutKinds.items().find((k) => k.kind === name);
  if (!kind) return undefined;
  return Object.entries(kind.fields as Record<string, FieldKind | FieldSpec>).map(([field, spec]) =>
    typeof spec === "string" ? { name: field, kind: spec, param: field } : { name: field, ...spec, param: spec.param ?? field },
  );
}

function writeField(kind: FieldKind, value: unknown): string | null {
  switch (kind) {
    case "string":
    case "text":
    case "number":
      return String(value ?? "");
    case "number|null":
      return value === null || value === undefined ? null : String(value);
    case "strings?":
      return value ? JSON.stringify(value) : null;
    default:
      return value ? String(value) : null;
  }
}

const positive = (value: string | null) => {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : undefined;
};

function readField(kind: FieldKind, raw: string | null, fallback: string | undefined): unknown {
  switch (kind) {
    case "string":
      return raw || INVALID;
    case "string?":
      return raw || undefined;
    case "text":
      return raw ?? fallback ?? INVALID;
    case "number":
      return positive(raw) ?? INVALID;
    case "number?":
      return positive(raw);
    case "number|null":
      return positive(raw) ?? null;
    case "strings?":
      return parseStrings(raw);
  }
}

/** 別ウィンドウの URL のハッシュ（"/popout/<種類>?…"。種類の表の順に書く） */
export function popoutPath(route: PopoutRoute): string {
  const fields = fieldsOf(route.kind);
  if (!fields) throw new Error(`別ウィンドウの種類 ${route.kind} がない（app/renderer/popout/contributes.ts）`);
  const params = new URLSearchParams();
  for (const field of fields) {
    const text = writeField(field.kind, (route as Record<string, unknown>)[field.name]);
    if (text !== null) params.set(field.param, text);
  }
  const query = params.toString();
  return `${PREFIX}${route.kind}${query ? `?${query}` : ""}`;
}

/** 別ウィンドウの URL のハッシュを読む（別ウィンドウでなければ・読めなければ undefined） */
export function parsePopout(hash: string): PopoutRoute | undefined {
  const path = hash.replace(/^#/, "");
  if (!path.startsWith(PREFIX)) return undefined;
  const [kind, query = ""] = path.slice(PREFIX.length).split("?");
  const fields = fieldsOf(kind);
  if (!fields) return undefined;
  const params = new URLSearchParams(query);
  const route: Record<string, unknown> = { kind };
  for (const field of fields) {
    const value = readField(field.kind, params.get(field.param), field.fallback);
    if (value === INVALID) return undefined;
    if (value !== undefined) route[field.name] = value;
  }
  return route as PopoutRoute;
}

/** 文字の表（JSON。読めなければ undefined） */
function parseStrings(text: string | null): Record<string, string> | undefined {
  if (!text) return undefined;
  try {
    const value: unknown = JSON.parse(text);
    if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
    return Object.values(value).every((v) => typeof v === "string") ? (value as Record<string, string>) : undefined;
  } catch {
    return undefined;
  }
}

/** 別ウィンドウを開けるか（Mac のアプリのときだけ） */
export const canPopout = (): boolean => Boolean(globalThis.window?.kickoff?.windows);

/** 別ウィンドウの中か（真ん中の画面・右の欄を開く頼みはメインのウィンドウへ送る） */
export const isPopoutWindow = (): boolean => globalThis.location !== undefined && parsePopout(location.hash) !== undefined;

/** サイドバーの別ウィンドウの中か（下書き・パネルの状態はメインのウィンドウのものを写して読み、変えるのはメインに頼む） */
export const isSidebarWindow = (): boolean => globalThis.location !== undefined && parsePopout(location.hash)?.kind === "sidebar";

/** 同じ別ウィンドウかの見分け（種類の keyIgnores の項目を除いた URL のハッシュ。変更の移るファイルなど） */
export function popoutKey(route: PopoutRoute): string {
  const ignores = popoutKinds.items().find((k) => k.kind === route.kind)?.keyIgnores ?? [];
  return popoutPath(ignores.length > 0 ? ({ ...route, ...Object.fromEntries(ignores.map((name) => [name, undefined])) } as PopoutRoute) : route);
}

/**
 * 別ウィンドウで開く（同じものがもう開いていれば前に出す）。title はウィンドウの名前、at は新しく開くときに置く画面の位置（タブをウィンドウの外へドラッグして離した所）。
 * 変更の移るファイルは、新しく開くときは URL で、もう開いていたときは知らせ（popoutFocus）で渡す
 */
export function openPopout(route: PopoutRoute, title: string, at: { x: number; y: number } | null = null) {
  void window.kickoff?.windows.openPopout(popoutPath(route), title, at).then(() => {
    if (route.kind === "changes" && route.focus) postWindowMessage({ type: "popoutFocus", key: popoutKey(route), focus: route.focus });
  });
}
