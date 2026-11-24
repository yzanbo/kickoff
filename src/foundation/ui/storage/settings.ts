// 画面の表示の設定（開閉・切り替え・幅・書きかけの文など）を localStorage / sessionStorage に保存する仕組み（値の形・読み書き・知らせ）。
// 保存するものは群（groups.ts の defineSettings）で宣言し（キー・値の形・初めの値・ID を含むか）、読み書きはすべてここを通す。
// 同じ設定を読むものどうし（部品も、React の外も）で値がそろう（書いたら、その設定を見ているものすべてに知らせる）。
// React からは hooks/useSetting.ts の useSetting で読む（ID ごとの設定は useSetting(family(id))）

/** 値の形（保存する文字との行き来と、未保存・読めない値のときの初めの値） */
export interface Shape<T> {
  /** 未保存・読めない値のときの値 */
  readonly initial: T;
  /** 保存した文字を値にする（読めない・知らない値は undefined = 初めの値） */
  decode(raw: string): T | undefined;
  /** 値を保存する文字にする（null ならキーごと消す） */
  encode(value: T): string | null;
}

/** 決まった文字列のどれか（choices は選べる値。並びは画面に並べる順に使ってよい） */
export interface ChoiceShape<T extends string> extends Shape<T> {
  readonly choices: readonly T[];
}

type Area = "local" | "session";

export interface Setting<T> extends Shape<T> {
  readonly key: string;
  /** 保存先（session はアプリを閉じるまで） */
  readonly area: Area;
  /** プロジェクト・チャット・グループなどの ID を（キーか値に）含む。DB を作り直したら捨てる（ID が振り直され、別のものを指すため） */
  readonly ids: boolean;
}

/** ID ごとの設定（グループごとの開閉など。キーは prefix ＋ ID） */
export interface SettingFamily<T, S = Shape<T>> {
  (id: string | number): S & Setting<T>;
  readonly prefix: string;
  /** 値の形（選べる値 choices などを、ID を決めずに読むとき） */
  readonly shape: S;
  readonly area: Area;
  readonly ids: boolean;
}

export interface SettingOptions {
  /** ID を含む（DB を作り直したら捨てる） */
  ids?: boolean;
  /** アプリを閉じるまで覚える（sessionStorage） */
  session?: boolean;
}

/** 設定（値の形）の値の型（選択肢の型を、宣言から作るとき） */
export type SettingValue<S> = S extends Shape<infer T> ? T : never;

/** Kickoff の保存するキーの頭（これで始まるキーは、宣言していなければ起動したときに消す） */
export const KEY_PREFIX = "kickoff:";

// ---- 値の形 ----

/** オン・オフ（"1" / "0"） */
export function flag(initial = false): Shape<boolean> {
  return { initial, decode: (raw) => (raw === "1" ? true : raw === "0" ? false : undefined), encode: (value) => (value ? "1" : "0") };
}

/** オン・オフか、まだ決めていないか（"1" / "0"。未保存は undefined = 使う側の初めの値。undefined を書くとキーごと消す） */
export function optionalFlag(): Shape<boolean | undefined> {
  return { initial: undefined, decode: (raw) => (raw === "1" ? true : raw === "0" ? false : undefined), encode: (value) => (value === undefined ? null : value ? "1" : "0") };
}

/** 決まった文字列のどれか（知らない値は初めの値） */
export function choice<const T extends string>(choices: readonly T[], initial: NoInfer<T>): ChoiceShape<T> {
  return { initial, choices, decode: (raw) => (choices.includes(raw as T) ? (raw as T) : undefined), encode: (value) => value };
}

/** 数（0・数でない値は初めの値） */
export function number(initial: number): Shape<number> {
  return { initial, decode: (raw) => Number(raw) || undefined, encode: (value) => String(value) };
}

/** 文字（空にしたらキーごと消す。空の値を残さない） */
export function text(): Shape<string> {
  return { initial: "", decode: (raw) => raw, encode: (value) => value || null };
}

const NO_STRINGS: readonly string[] = Object.freeze([]);

/** 文字列の配列（JSON。壊れた値・未保存は初めの値（省けば空）、文字でない要素は捨てる。空にしても [] で残す = 初めの値に戻らない） */
export function list(initial: readonly string[] = NO_STRINGS): Shape<readonly string[]> {
  return json((value) => (Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : undefined), initial);
}

const NO_ENTRIES: Readonly<Record<string, never>> = Object.freeze({});

/** JSON のオブジェクト（項目の値を guard で確かめ、合わない項目は捨てる。guard がなければ中身は使う側で確かめる。空ならキーごと消す） */
export function record<V = unknown>(guard?: (value: unknown) => value is V): Shape<Readonly<Record<string, V>>> {
  return json(
    (value) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
      return guard ? Object.fromEntries(Object.entries(value).filter(([, v]) => guard(v))) : (value as Record<string, V>);
    },
    NO_ENTRIES,
    (value) => Object.keys(value).length === 0,
  );
}

/** JSON で保存する値（parse で形を確かめ、合わなければ初めの値。empty なら、キーごと消す） */
export function json<T>(parse: (value: unknown) => T | undefined, initial: T, empty?: (value: T) => boolean): Shape<T> {
  return {
    initial,
    decode: (raw) => {
      try {
        return parse(JSON.parse(raw));
      } catch {
        return undefined;
      }
    },
    encode: (value) => (empty?.(value) ? null : JSON.stringify(value)),
  };
}

// ---- 宣言（純粋。どこにも登録しない。宣言済みとみなすのは、起動の片付けに渡した群だけ = groups.ts） ----

const idOf = (area: Area, key: string) => `${area}\n${key}`;

function assertPrefixed(key: string) {
  if (!key.startsWith(KEY_PREFIX)) throw new Error(`保存のキーが kickoff: で始まりません: ${key}`);
}

/** 設定を 1 つ作る（群の defineSettings の中で使う） */
export function defineSetting<S extends Shape<unknown>>(key: string, shape: S, options: SettingOptions = {}): S & Setting<SettingValue<S>> {
  assertPrefixed(key);
  return { ...shape, key, area: options.session ? "session" : "local", ids: options.ids ?? false } as S & Setting<SettingValue<S>>;
}

/** ID ごとの設定を作る（キーは prefix ＋ ID。prefix は ":" で終える。ほかは defineSetting と同じ） */
export function defineSettingFamily<S extends Shape<unknown>>(prefix: string, shape: S, options: SettingOptions = {}): SettingFamily<SettingValue<S>, S> {
  assertPrefixed(prefix);
  if (!prefix.endsWith(":")) throw new Error(`ID ごとの設定のキーの頭は ":" で終えてください: ${prefix}`);
  const area: Area = options.session ? "session" : "local";
  const ids = options.ids ?? false;
  const members = new Map<string, S & Setting<SettingValue<S>>>();
  return Object.assign(
    (id: string | number) => {
      const key = `${prefix}${id}`;
      let member = members.get(key);
      if (!member) {
        member = { ...shape, key, area, ids } as S & Setting<SettingValue<S>>;
        members.set(key, member);
      }
      return member;
    },
    { prefix, shape, area, ids },
  );
}

// ---- 読み書き ----

function storageOf(area: Area): Storage | undefined {
  return area === "local" ? globalThis.localStorage : globalThis.sessionStorage;
}

function getRaw(area: Area, key: string): string | null {
  try {
    return storageOf(area)?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

/** 読んだ値（保存した文字が同じなら、同じ値を返す。配列・オブジェクトの参照が毎回変わらないように） */
const cache = new Map<string, { raw: string | null; value: unknown }>();

const valueOf = <T>(setting: Shape<T>, raw: string | null): T => (raw === null ? setting.initial : (setting.decode(raw) ?? setting.initial));

/** いまの値（未保存・読めない値なら初めの値。React の外からも読める） */
export function readSetting<T>(setting: Setting<T>): T {
  const id = idOf(setting.area, setting.key);
  const raw = getRaw(setting.area, setting.key);
  const hit = cache.get(id);
  if (hit && hit.raw === raw) return hit.value as T;
  const value = valueOf(setting, raw);
  cache.set(id, { raw, value });
  return value;
}

/** 値を保存して、その設定を見ているものに知らせる（保存する文字が変わらなければ何もしない） */
export function writeSetting<T>(setting: Setting<T>, value: T): void {
  const raw = setting.encode(value);
  if (raw === getRaw(setting.area, setting.key)) return;
  try {
    const storage = storageOf(setting.area);
    if (raw === null) storage?.removeItem(setting.key);
    else storage?.setItem(setting.key, raw);
  } catch (e) {
    // 容量の上限などで残せなければ、値は前のまま（画面の操作は止めない）
    console.warn(`[storage] ${setting.key} を保存できませんでした`, e);
    return;
  }
  cache.set(idOf(setting.area, setting.key), { raw, value: valueOf(setting, raw) });
  notify(setting.area, setting.key);
}

// ---- 知らせ ----

const keyListeners = new Map<string, Set<() => void>>();
const familyListeners = new Map<string, Set<() => void>>();
const familyVersions = new Map<string, number>();
/** 購読・版を読まれた仲間（書いたキーがどの仲間のものかを、宣言の登録なしに引くため） */
const watchedFamilies = new Map<string, { area: Area; prefix: string }>();

function watch(family: SettingFamily<unknown>): string {
  const id = idOf(family.area, family.prefix);
  if (!watchedFamilies.has(id)) watchedFamilies.set(id, { area: family.area, prefix: family.prefix });
  return id;
}

function listen(map: Map<string, Set<() => void>>, id: string, listener: () => void): () => void {
  let set = map.get(id);
  if (!set) map.set(id, (set = new Set()));
  set.add(listener);
  return () => void set.delete(listener);
}

function notify(area: Area, key: string) {
  for (const listener of [...(keyListeners.get(idOf(area, key)) ?? [])]) listener();
  for (const [id, watched] of watchedFamilies) {
    if (watched.area !== area || !key.startsWith(watched.prefix)) continue;
    familyVersions.set(id, (familyVersions.get(id) ?? 0) + 1);
    for (const listener of [...(familyListeners.get(id) ?? [])]) listener();
  }
}

/**
 * ほかのウィンドウ（別ウィンドウで開いた右の欄の変更・サブエージェントなど。同じ出どころなので localStorage を共有する）が書き換えた設定も、
 * このウィンドウで読んでいるものに知らせる（会話の文字の大きさ・差分の表示のしかたなどを、どのウィンドウでもそろえる）。
 * sessionStorage はウィンドウごとなので見ない
 */
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.storageArea === storageOf("local")) noteOtherWindowChange(e.key);
  });
}

/**
 * ほかのウィンドウが localStorage の key を書き換えた（null はすべて消した）ことを、このウィンドウで読んでいるものに知らせる。
 * すべて消したときは、キーごとの設定と ID ごとの設定（仲間）のどちらにも知らせる（仲間のキーは読んでいる ID が分からないので、仲間ごとに 1 回）
 */
export function noteOtherWindowChange(key: string | null): void {
  if (key !== null) {
    if (!key.startsWith(KEY_PREFIX)) return;
    cache.delete(idOf("local", key));
    notify("local", key);
    return;
  }
  for (const id of [...cache.keys()]) if (id.startsWith(idOf("local", ""))) cache.delete(id);
  for (const id of [...keyListeners.keys()]) {
    if (!id.startsWith(idOf("local", ""))) continue;
    for (const listener of [...(keyListeners.get(id) ?? [])]) listener();
  }
  for (const [id, watched] of watchedFamilies) {
    if (watched.area !== "local") continue;
    familyVersions.set(id, (familyVersions.get(id) ?? 0) + 1);
    for (const listener of [...(familyListeners.get(id) ?? [])]) listener();
  }
}

/** その設定が書き換わったら listener を呼ぶ（やめるときは返り値を呼ぶ） */
export function subscribeSetting(setting: Setting<unknown>, listener: () => void): () => void {
  return listen(keyListeners, idOf(setting.area, setting.key), listener);
}

/** その仲間（ID ごとの設定）のどれかが書き換わったら listener を呼ぶ */
export function subscribeFamily(family: SettingFamily<unknown>, listener: () => void): () => void {
  return listen(familyListeners, watch(family), listener);
}

/** 仲間のどれかが書き換わるたびに増える数（useSyncExternalStore で描き直すため） */
export function familyVersion(family: SettingFamily<unknown>): number {
  return familyVersions.get(watch(family)) ?? 0;
}

// ---- 一覧と片付け ----

function storedKeys(area: Area): string[] {
  try {
    const storage = storageOf(area);
    if (!storage) return [];
    return Array.from({ length: storage.length }, (_, i) => storage.key(i)).filter((k): k is string => k?.startsWith(KEY_PREFIX) ?? false);
  } catch {
    return [];
  }
}

/** 仲間のうち、いま保存してあるものの ID（「すべて開く」で、描いていないまとまりの値もそろえるときなど） */
export function storedIds(family: SettingFamily<unknown>): string[] {
  return storedKeys(family.area)
    .filter((k) => k.startsWith(family.prefix))
    .map((k) => k.slice(family.prefix.length));
}

/** 保存したキーのうち test に合うものを、どちらの保存先からも消して知らせる（起動の片付け = groups.ts）。消したキーを返す */
export function removeStored(test: (area: Area, key: string) => boolean): string[] {
  const removed: string[] = [];
  for (const area of ["local", "session"] as const) {
    for (const key of storedKeys(area).filter((k) => test(area, k))) {
      try {
        storageOf(area)?.removeItem(key);
      } catch {
        continue;
      }
      cache.delete(idOf(area, key));
      removed.push(key);
      notify(area, key);
    }
  }
  return removed;
}
