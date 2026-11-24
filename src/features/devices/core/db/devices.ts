import type { DatabaseSync } from "node:sqlite";
import { DEVICE_ACCESSES, type Device, type DeviceAccess, type DevicePush } from "@shared/devices/types";
import { NOW } from "@/foundation/core/db/db";
import type { RowOf } from "@/foundation/core/db/table";
import { hashToken } from "@/features/devices/core/token";
import { devicesTable } from "@/features/devices/core/schema";

/** 最後に使った時刻を書き直す間隔（API を呼ぶたびに書かない） */
const TOUCH_INTERVAL_SEC = 60;

/** 知らない値（あとの版で足したものなど）は、見るだけとして読む（できることを広げる側に倒さない） */
const accessOf = (value: string): DeviceAccess => ((DEVICE_ACCESSES as readonly string[]).includes(value) ? (value as DeviceAccess) : "read");

const toDevice = (r: RowOf<typeof devicesTable.columns>): Device => ({
  id: r.id,
  name: r.name,
  created_at: r.created_at,
  last_used_at: r.last_used_at,
  has_push: r.push !== null,
  access: accessOf(r.access),
});

export type DeviceStore = ReturnType<typeof createDeviceStore>;

/**
 * スマホ連携の端末（devices の表）。トークンは hash にして置き、hash で引く（本物は持たない）。プッシュの宛先は push で読むだけで、Device には出さない
 */
export function createDeviceStore(db: DatabaseSync) {
  const rows = devicesTable.on(db);
  /** あれば変えて端末を返す（なければ null） */
  const change = (id: number, patch: Partial<Record<string, unknown>>) => (rows.get(id) ? rows.update(id, patch) : null);
  return {
    /** つないだ順 */
    list: (): Device[] => rows.list().map(toDevice),
    get(id: number): Device | null {
      const r = rows.get(id);
      return r ? toDevice(r) : null;
    },
    /** トークンで引く（hash で比べる。取り消した・知らないトークンなら null） */
    byToken(token: string): Device | null {
      const r = rows.one("token_hash = ?", [hashToken(token)]);
      return r ? toDevice(r) : null;
    },
    create: (name: string, token: string, access: DeviceAccess = "full"): Device => toDevice(rows.insert({ name, token_hash: hashToken(token), access })),
    /** できることを変える（なければ null） */
    setAccess(id: number, access: DeviceAccess): Device | null {
      const r = change(id, { access });
      return r ? toDevice(r) : null;
    },
    /** 最後に使った時刻を進める（前に書いてから TOUCH_INTERVAL_SEC 経っていなければ書かない） */
    touch(id: number): void {
      db.prepare(
        `UPDATE devices SET last_used_at = ${NOW} WHERE id = ? AND (last_used_at IS NULL OR last_used_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-${TOUCH_INTERVAL_SEC} seconds'))`,
      ).run(id);
    },
    /** プッシュの宛先（なければ null） */
    push: (id: number): DevicePush | null => rows.get(id)?.push ?? null,
    /** プッシュの宛先を登録する・外す（null） */
    setPush(id: number, push: DevicePush | null): void {
      change(id, { push });
    },
    /** 取り消す（あったか） */
    remove: (id: number): boolean => rows.remove(id),
  };
}
