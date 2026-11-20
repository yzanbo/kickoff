// 保存の宣言の群（機能ごとの ui/storage.ts に書く defineSettings）と、起動したときの片付け。
// 宣言はモジュールの変数に登録しない（純粋）。宣言済みとみなすのは、片付け（prepareStorage）に渡した群だけ
// （宣言していない kickoff: のキーは起動したときに消える。片付けより前に、全部の群を集めて渡す = @/app/renderer/storage.ts）
import { defineSetting, defineSettingFamily, KEY_PREFIX, removeStored, type Setting, type SettingFamily, type SettingOptions, type SettingValue, type Shape } from "./settings";

/** ID ごとの設定の宣言（defineSettings の中で使う。キーは頭 ＋ ID） */
export interface FamilySpec<S extends Shape<unknown>> {
  readonly family: true;
  readonly shape: S;
  readonly options: SettingOptions;
}

/** 単独の設定に ids・session を付けるときの宣言（付けないなら形をそのまま書く） */
export interface SingleSpec<S extends Shape<unknown>> {
  readonly family: false;
  readonly shape: S;
  readonly options: SettingOptions;
}

export function family<S extends Shape<unknown>>(shape: S, options: SettingOptions = {}): FamilySpec<S> {
  return { family: true, shape, options };
}

export function single<S extends Shape<unknown>>(shape: S, options: SettingOptions = {}): SingleSpec<S> {
  return { family: false, shape, options };
}

type Spec = Shape<unknown> | SingleSpec<Shape<unknown>> | FamilySpec<Shape<unknown>>;

type Declared<X> =
  X extends FamilySpec<infer S> ? SettingFamily<SettingValue<S>, S> : X extends SingleSpec<infer S> ? S & Setting<SettingValue<S>> : X extends Shape<infer T> ? X & Setting<T> : never;

/** 群の中の宣言 1 つ（単独の設定か、ID ごとの設定） */
type DeclaredSetting = Setting<unknown> | SettingFamily<unknown, unknown>;

/** 片付けに渡す群（どの機能の群も、この形として集める） */
export interface StorageGroup {
  readonly namespace: string;
  readonly settings: Readonly<Record<string, DeclaredSetting>>;
}

export interface SettingsGroup<N extends string, S extends Record<string, Spec>> extends StorageGroup {
  readonly namespace: N;
  readonly settings: { readonly [K in keyof S]: Declared<S[K]> };
}

/** 名前（camelCase）をキーの部分（kebab）にする（listWidth → list-width） */
function kebab(name: string): string {
  return name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
}

const isFamilySpec = (spec: Spec): spec is FamilySpec<Shape<unknown>> => "family" in spec && spec.family === true;
const isSingleSpec = (spec: Spec): spec is SingleSpec<Shape<unknown>> => "family" in spec && spec.family === false;

/**
 * 機能の保存のキーを宣言する。キーは kickoff:<namespace>:<名前の kebab>（ID ごとは、その後ろに ":" ＋ ID）。
 * namespace は機能のフォルダの名前（土台は ui・shell・external）。純粋（どこにも登録しない）
 */
export function defineSettings<const N extends string, S extends Record<string, Spec>>(namespace: N, spec: S): SettingsGroup<N, S> {
  if (!/^[a-zA-Z]+$/.test(namespace)) throw new Error(`保存の namespace は英字だけにしてください: ${namespace}`);
  const settings: Record<string, DeclaredSetting> = {};
  for (const [name, item] of Object.entries(spec)) {
    const key = `${KEY_PREFIX}${namespace}:${kebab(name)}`;
    if (isFamilySpec(item)) settings[name] = defineSettingFamily(`${key}:`, item.shape, item.options) as DeclaredSetting;
    else if (isSingleSpec(item)) settings[name] = defineSetting(key, item.shape, item.options);
    else settings[name] = defineSetting(key, item);
  }
  return { namespace, settings } as unknown as SettingsGroup<N, S>;
}

type Area = Setting<unknown>["area"];

/** 群の宣言を保存先ごとに引ける形にしたもの */
interface GroupIndex {
  readonly singles: Map<string, Setting<unknown>>;
  readonly families: SettingFamily<unknown, unknown>[];
}

const idOf = (area: Area, key: string) => `${area}\n${key}`;

/** キーがほかの宣言と重ならないか（1 つのキーがどの宣言のものか、1 通りに決まるように） */
function assertFree(index: GroupIndex, area: Area, key: string, isPrefix: boolean) {
  const sameArea = index.families.filter((f) => f.area === area);
  const clash = isPrefix
    ? sameArea.some((f) => key.startsWith(f.prefix) || f.prefix.startsWith(key)) || [...index.singles.values()].some((s) => s.area === area && s.key.startsWith(key))
    : index.singles.has(idOf(area, key)) || sameArea.some((f) => key.startsWith(f.prefix));
  if (clash) throw new Error(`保存のキーが、ほかの宣言と重なっています: ${key}`);
}

function indexGroups(groups: readonly StorageGroup[], check: boolean): GroupIndex {
  const index: GroupIndex = { singles: new Map(), families: [] };
  const namespaces = new Set<string>();
  for (const group of groups) {
    if (check && namespaces.has(group.namespace)) throw new Error(`保存の namespace が 2 回宣言されています: ${group.namespace}`);
    namespaces.add(group.namespace);
    for (const item of Object.values(group.settings)) {
      if (typeof item === "function") {
        if (check) assertFree(index, item.area, item.prefix, true);
        index.families.push(item);
      } else {
        if (check) assertFree(index, item.area, item.key, false);
        index.singles.set(idOf(item.area, item.key), item);
      }
    }
  }
  return index;
}

/** 群どうしが重ならないか（同じ namespace を 2 回・同じキーを 2 回・ほかの ID ごとの頭に入るキーで投げる） */
export function assertGroups(groups: readonly StorageGroup[]): void {
  indexGroups(groups, true);
}

/** 群に宣言した設定か（onlyIds なら、ID を含むものだけ） */
function declared(index: GroupIndex, area: Area, key: string, onlyIds: boolean): boolean {
  const found = index.singles.get(idOf(area, key));
  if (found) return !onlyIds || found.ids;
  return index.families.some((f) => f.area === area && key.startsWith(f.prefix) && (!onlyIds || f.ids));
}

/** 群に宣言していない kickoff: のキー（なくした機能の古いキーなど）を消す（起動したときに 1 回）。消したキーを返す */
export function pruneUndeclared(groups: readonly StorageGroup[]): string[] {
  const index = indexGroups(groups, false);
  return removeStored((area, key) => !declared(index, area, key, false));
}

/** ID を含む設定（ids を付けて宣言したもの）をすべて消す（DB を作り直したとき）。消したキーを返す */
export function forgetIdSettings(groups: readonly StorageGroup[]): string[] {
  const index = indexGroups(groups, false);
  return removeStored((area, key) => declared(index, area, key, true));
}
