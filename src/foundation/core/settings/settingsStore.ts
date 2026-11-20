// 設定の店（settings の表。キーごとに JSON で持ち、既定と混ぜて返す）。何の設定かは知らない（設定の表は組み立てが渡す）
import type { DatabaseSync } from "node:sqlite";
import { defaultsOf, entriesOf, type AppSettings, type SettingsPatch, type SettingTable } from "@shared/foundation/contract/settings";

export interface SettingsStore<T, P> {
  /** 既定 ＋ 保存した値（知らないキーは返さない） */
  get(): T;
  /** 送った項目だけを変える（項目の中は丸ごと置き換える。entries の項目は送った中の項目だけ） */
  update(patch: P): T;
}

/** 中の項目ごとに置き換える値（AI ごとの既定など。名前 → オブジェクトの辞書） */
type Entries = Record<string, object>;

/**
 * 設定の店を作る。entries の項目は中の項目ごとに既定へ重ね（書いていない項目は既定）、変えるときも送った中の項目だけを置き換える。
 * 変えたら notify（画面・スマホへの知らせ）
 */
export function createSettingsStore<T extends object, P extends { [K in keyof T]?: unknown }>(
  db: Pick<DatabaseSync, "prepare">,
  defaults: T,
  notify: (settings: T) => void,
  entries: readonly (keyof T & string)[] = [],
): SettingsStore<T, P> {
  const select = db.prepare("SELECT key, value FROM settings");
  const upsert = db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value");
  const base = defaults as Record<string, unknown>;
  const get = (): T => {
    const rows = select.all() as { key: string; value: string }[];
    const stored: Record<string, unknown> = Object.fromEntries(rows.filter((r) => r.key in base).map((r) => [r.key, JSON.parse(r.value)]));
    for (const key of entries) {
      const saved = stored[key] as Partial<Entries> | undefined;
      stored[key] = Object.fromEntries(Object.entries(base[key] as Entries).map(([name, value]) => [name, { ...value, ...saved?.[name] }]));
    }
    return { ...defaults, ...stored };
  };
  return {
    get,
    update(patch) {
      const current = get() as Record<string, unknown>;
      for (const [key, value] of Object.entries(patch)) {
        if (value === undefined) continue;
        const next = (entries as readonly string[]).includes(key) ? { ...(current[key] as Entries), ...(value as Entries) } : value;
        upsert.run(key, JSON.stringify(next));
      }
      const settings = get();
      notify(settings);
      return settings;
    },
  };
}

/** アプリ全体の設定の店（table は組み立てが渡す全部の機能の表 ALL_SETTINGS。AppSettings の形も同じ表から足すので、既定はその形になる） */
export function openAppSettings(db: Pick<DatabaseSync, "prepare">, table: SettingTable, notify: (settings: AppSettings) => void): SettingsStore<AppSettings, SettingsPatch> {
  return createSettingsStore<AppSettings, SettingsPatch>(db, defaultsOf(table) as AppSettings, notify, entriesOf(table) as (keyof AppSettings & string)[]);
}
