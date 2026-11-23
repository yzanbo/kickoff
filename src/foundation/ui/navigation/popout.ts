// 別ウィンドウ（チャットの画面の右の欄の変更・ファイル・サブエージェント・子チャット・ノート・DB クライアント、左のサイドバー、
// 右端のチャット欄とそのブラウザ・ターミナルのタブを、メインのウィンドウの外に出して見る）の行き先。
// 種類は持ち主の機能が ui/popoutKinds.ts で PopoutParamsMap に足し、URL の項目の表を popoutKinds に入れる
import type { ComponentType } from "react";
import { definePoint } from "@/foundation/ui/points";
import { realTimers, type Timers } from "@shared/foundation/time";
import { onWindowMessage, postToMainWindow, postWindowMessage, type WindowMessageMap } from "./windowBus";

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
/** 種類の行き先 */
type RouteOf<K extends PopoutKindId> = Extract<PopoutRoute, { kind: K }>;

/** 「戻す」ボタンの名前と説明（left: 左の欄へ戻す = サイドバー） */
export interface PopoutDockLabel {
  label: string;
  tip: string;
  left?: boolean;
}

export interface PopoutKind<K extends PopoutKindId = PopoutKindId> {
  kind: K;
  /** 上の帯の、何のウィンドウかの札 */
  label: string;
  /** 中身（PopoutApp が描く。右の欄と同じく開いたチャットを「メインのチャット」にするものは、中で SideScope に包む） */
  Page: ComponentType<{ route: RouteOf<K> }>;
  /** 上の帯（札と「戻す」）を描くか（既定は描く。子チャットは自分の帯に同じボタンを置く） */
  bar?: boolean;
  /** ⌘F でこのウィンドウを探すか（既定は探す。ブラウザはページの検索） */
  find?: boolean;
  /** 「戻す」ボタンの名前と説明（なければ「右の欄に戻す」） */
  dockLabel?(route: RouteOf<K>): PopoutDockLabel;
  /** 「戻す」を押したとき（別ウィンドウで呼ぶ。なければ beforeDock のあと dockAndClose） */
  returnSelf?(route: RouteOf<K>): void;
  /** dockAndClose の前に別ウィンドウでする（ノートの書きかけを残す） */
  beforeDock?(): void;
  /**
   * 戻す（メインのウィンドウで呼ぶ）: 中身をメインのウィンドウの元の欄で開き直す。返り値が済んでから docked を送り、別ウィンドウが閉じる
   * （ターミナルはシェルの持ち主をメインのウィンドウに移してから）
   */
  dock?(route: RouteOf<K>): Promise<void> | void;
  /**
   * メインのウィンドウの値の写しを読み続ける（サイドバー: 下書きの行・開いている子チャット）。メインのウィンドウは開いている間 publish を送り、
   * watch が知らせるたびに（まとめて）送り直す。別ウィンドウは begin で受け始め、届いたものを apply に渡す
   */
  follow?: PopoutFollow;
  /** URL の項目（書く順に並べる。path と parse をこの表から作る。同じものは同じ文字になり、メインプロセスが同じウィンドウを前に出す） */
  fields: { readonly [F in keyof PopoutParamsMap[K]]-?: FieldKind | FieldSpec };
  /** 同じウィンドウかを見るときに外す項目（変更の移るファイルなど） */
  keyIgnores?: readonly (keyof PopoutParamsMap[K] & string)[];
}
/** メインのウィンドウの値の写しの受け渡し（種類の follow） */
export interface PopoutFollow {
  /** メインのウィンドウ: いまの写し（要る値だけ。知らせに載せるので JSON にできる形） */
  publish(): unknown;
  /** メインのウィンドウ: 写しの元が変わったら listener を呼ぶ。やめるときは返り値を呼ぶ */
  watch(listener: () => void): () => void;
  /** 別ウィンドウ: 写しを受け始める（届くまでの値にする）。やめるときは返り値を呼ぶ */
  begin(): () => void;
  /** 別ウィンドウ: 届いた写しを当てる */
  apply(snapshot: unknown): void;
}
declare module "./windowBus" {
  interface WindowMessageMap {
    /** メインのウィンドウの値の写し（種類の follow の publish。開いている間、変わるたびに送る） */
    popoutFollow: { kind: string; snapshot: unknown };
    /** 別ウィンドウの中身を、メインのウィンドウのチャットの画面の右の欄（チャット欄・パネルのタブは元の欄）で開き直す（「右の欄に戻す」。開き直したら docked） */
    dockPopout: { route: PopoutRoute };
    /** dockPopout で開き直し終えた（key は popoutKey。別ウィンドウはこれを待ってから閉じる。ターミナルの持ち主をメインのウィンドウに移してから閉じるため） */
    docked: { key: string };
    /** もう開いている別ウィンドウの「変更」を、そのファイルの位置へ移す（key は popoutKey） */
    popoutFocus: { key: string; focus: string };
  }
}

/** 別ウィンドウの種類（key は kind。持ち主の機能の ui/contributes.ts が出す） */
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
  if (!fields) throw new Error(`別ウィンドウの種類 ${route.kind} がない（持ち主の ui/contributes.ts）`);
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
 * 変更の移るファイルは、新しく開くときは URL で、もう開いていたときは知らせ（popoutFocus）で渡す。
 * 返り値は開けたか（開いた・前に出したら true。デスクトップアプリでない・開けなかったら false。タブを移すときは、開けてから元のタブを閉じる）
 */
export async function openPopout(route: PopoutRoute, title: string, at: { x: number; y: number } | null = null): Promise<boolean> {
  const windows = window.kickoff?.windows;
  if (!windows) return false;
  try {
    await windows.openPopout(popoutPath(route), title, at);
  } catch (e) {
    console.error("別ウィンドウを開けなかった", e);
    return false;
  }
  if (route.kind === "changes" && route.focus) postWindowMessage("popoutFocus", { key: popoutKey(route), focus: route.focus });
  return true;
}

/** 種類の項目（なければ undefined） */
export const popoutKindOf = <K extends PopoutKindId>(kind: K): PopoutKind<K> | undefined => popoutKinds.items().find((k) => k.kind === kind) as PopoutKind<K> | undefined;

/** メインのウィンドウ: 別ウィンドウの中身を元の欄で開き直す（種類の dock。メインのウィンドウの知らせの受け口が呼び、済んだら docked を送る） */
export async function dockPopout(route: PopoutRoute): Promise<void> {
  const kind = popoutKindOf(route.kind) as PopoutKind | undefined;
  await kind?.dock?.(route as never);
}

/** 続けて変わったときに 1 回にまとめる間（メインのウィンドウが裏にあっても止まらないよう、rAF ではなく時計で） */
const FOLLOW_DELAY_MS = 50;

/** メインのウィンドウ: 種類の follow の写しを送り、元が変わるたびに（まとめて）送り直す。やめるときは返り値を呼ぶ */
export function publishFollow(
  kind: PopoutKindId,
  post: (message: WindowMessageMap["popoutFollow"]) => void = (m) => postWindowMessage("popoutFollow", m),
  timers: Pick<Timers, "timer"> = realTimers,
): () => void {
  const follow = popoutKindOf(kind)?.follow;
  if (!follow) return () => {};
  let cancel: (() => void) | undefined;
  const send = () => {
    cancel = undefined;
    post({ kind, snapshot: follow.publish() });
  };
  send();
  const off = follow.watch(() => {
    cancel ??= timers.timer(send, FOLLOW_DELAY_MS);
  });
  return () => {
    off();
    cancel?.();
  };
}

/** 別ウィンドウ: メインのウィンドウから届く種類の follow の写しを受け取る。やめるときは返り値を呼ぶ */
export function followMain(kind: PopoutKindId): () => void {
  const follow = popoutKindOf(kind)?.follow;
  if (!follow) return () => {};
  const end = follow.begin();
  const off = onWindowMessage("popoutFollow", (m) => {
    if (m.kind === kind) follow.apply(m.snapshot);
  });
  return () => {
    off();
    end();
  };
}

/** docked を待つ上限（メインのウィンドウが応えなくても閉じる） */
export const DOCK_WAIT_MS = 3000;

/** このウィンドウを閉じる（閉じ方を聞かない。デスクトップアプリでなければ、ふつうに閉じる） */
export const closeSelf = (): void => void (window.kickoff ? window.kickoff.windows.closeSelf() : window.close());

/** 戻し終えた知らせ（key の docked）が届いたら・waitMs たったら、このウィンドウを閉じる（onDocked は知らせの受け方・timers は時計。テストが差し替える） */
export function closeWhenDocked(
  key: string,
  waitMs = DOCK_WAIT_MS,
  onDocked: (handler: (m: { key: string }) => void) => () => void = (handler) => onWindowMessage("docked", handler),
  timers: Pick<Timers, "timer"> = realTimers,
): void {
  const cancel = timers.timer(closeSelf, waitMs);
  const off = onDocked((m) => {
    if (m.key !== key) return;
    cancel();
    off();
    closeSelf();
  });
}

/** 別ウィンドウ: 中身をメインのウィンドウの元の欄で開き直すよう頼み、docked を waitMs まで待って閉じる */
export function dockAndClose(route: PopoutRoute, opts: { waitMs?: number } = {}): void {
  closeWhenDocked(popoutKey(route), opts.waitMs);
  postToMainWindow("dockPopout", { route });
}

/** メインのウィンドウ: 別ウィンドウが閉じたら（落ちた・画面が知らせられずに閉じたときも。メインプロセスから）そのパスを知らせる。やめるときは返り値を呼ぶ */
export const onPopoutClosed = (handler: (path: string) => void): (() => void) | undefined => window.kickoff?.windows.onPopoutClosed(handler);
