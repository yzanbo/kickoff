// 設定の宣言（純粋。zod を読まない）。機能が src/shared/<機能>/settings.ts に表を書き、src/app/shared/settings.ts が束ねて AppSettings の形を足す。
// PUT の zod は機能の core/settings.ts（@/foundation/core/settings/defineSettingSchemas.ts で表と突き合わせる）

/** 1 つの設定（既定の値。entries は中の項目ごとに既定へ重ね、変えるときも送った中の項目だけを置き換える = AI ごとの既定など） */
export interface SettingSpec<T, E extends boolean = boolean> {
  readonly default: T;
  readonly entries: E;
}

export function setting<T>(spec: { default: T }): SettingSpec<T, false>;
export function setting<T extends Record<string, object>>(spec: { default: T; entries: true }): SettingSpec<T, true>;
export function setting<T>(spec: { default: T; entries?: boolean }): SettingSpec<T> {
  return { default: spec.default, entries: spec.entries ?? false };
}

/** 機能の設定の表（項目の名前は API・保存の名前 = snake_case） */
export type SettingTable = { readonly [key: string]: SettingSpec<unknown> };

/** 表の値の形 */
export type SettingsOf<T extends SettingTable> = { -readonly [K in keyof T]: T[K] extends SettingSpec<infer V> ? V : never };

/** 表の変更の形（送った項目だけ。entries の項目は中の項目の一部だけを送れる） */
export type SettingsPatchOf<T extends SettingTable> = {
  -readonly [K in keyof T]?: T[K] extends SettingSpec<infer V, true> ? Partial<V> : T[K] extends SettingSpec<infer V> ? V : never;
};

/** 表の既定の値 */
export function defaultsOf<T extends SettingTable>(table: T): SettingsOf<T> {
  return Object.fromEntries(Object.entries(table).map(([key, spec]) => [key, spec.default])) as SettingsOf<T>;
}

/** 中の項目ごとに重ねる項目の名前 */
export const entriesOf = <T extends SettingTable>(table: T): (keyof T & string)[] => Object.keys(table).filter((key) => table[key].entries);

/** アプリ全体の設定（全部の機能の表を束ねた形。src/app/shared/settings.ts が declare module で足す） */
export interface AppSettings {}

/** 設定の変更（PUT /api/settings。送った項目だけを変える。src/app/shared/settings.ts が declare module で足す） */
export interface SettingsPatch {}
