// 機能の設定の表に合わせた PUT /api/settings の zod（項目ごと）。束ねは @/app/core/settings.ts
import type { z } from "zod";
import type { SettingsPatchOf, SettingTable } from "@shared/foundation/contract/settings";

/** 送った項目の値（undefined は除く） */
type PatchValue<T extends SettingTable, K extends keyof T> = Exclude<SettingsPatchOf<T>[K], undefined>;

/**
 * 表の項目ごとの zod を書く。表にあって zod がない項目・zod にあって表にない項目・通す値が表の形に入らない zod は、型検査で落ちる
 * （設定を足して zod を書き忘れると気づく）
 */
export function defineSettingSchemas<T extends SettingTable, S extends { [K in keyof S]: K extends keyof T ? z.ZodType<PatchValue<T, K>> : never }>(
  _table: T,
  schemas: S & { [K in Exclude<keyof T, keyof S>]: "設定の宣言と形が違います（この項目の zod がない）" },
): S {
  return schemas;
}
