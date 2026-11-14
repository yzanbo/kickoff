import type { DatabaseSync } from "node:sqlite";
import { DEVICE_ACCESSES, type Device, type DeviceAccess, type DevicePush } from "@shared/types";
import { NOW } from "./schema.js";

/** 最後に使った時刻を書き直す間隔（API を呼ぶたびに書かない） */
const TOUCH_INTERVAL_SEC = 60;

interface DeviceRow {
  id: number;
  name: string;
  push: string | null;
  created_at: string;
  last_used_at: string | null;
  access: string;
}

const COLUMNS = "id, name, push, created_at, last_used_at, access";

/** 知らない値（あとの版で足したものなど）は、見るだけとして読む（できることを広げる側に倒さない） */
const accessOf = (value: string): DeviceAccess => ((DEVICE_ACCESSES as readonly string[]).includes(value) ? (value as DeviceAccess) : "read");

const toDevice = (r: DeviceRow): Device => ({
  id: r.id,
  name: r.name,
  created_at: r.created_at,
  last_used_at: r.last_used_at,
  has_push: r.push !== null,
  access: accessOf(r.access),
});

/**
 * スマホ連携の端末（devices の表）。トークンは hash で引く（本物は持たない）。プッシュの宛先は push で読むだけで、Device には出さない
 */
export function createDeviceStore(db: DatabaseSync) {
  const row = (id: number) => db.prepare(`SELECT ${COLUMNS} FROM devices WHERE id = ?`).get(id) as DeviceRow | undefined;
  return {
    /** つないだ順 */
    list(): Device[] {
      return (db.prepare(`SELECT ${COLUMNS} FROM devices ORDER BY id`).all() as unknown as DeviceRow[]).map(toDevice);
    },
    get(id: number): Device | null {
      const r = row(id);
      return r ? toDevice(r) : null;
    },
    /** トークンの hash で引く（取り消した・知らない hash なら null） */
    byTokenHash(tokenHash: string): Device | null {
      const r = db.prepare(`SELECT ${COLUMNS} FROM devices WHERE token_hash = ?`).get(tokenHash) as DeviceRow | undefined;
      return r ? toDevice(r) : null;
    },
    create(name: string, tokenHash: string, access: DeviceAccess = "full"): Device {
      const { lastInsertRowid } = db.prepare("INSERT INTO devices (name, token_hash, access) VALUES (?, ?, ?)").run(name, tokenHash, access);
      return toDevice(row(Number(lastInsertRowid))!);
    },
    /** できることを変える（なければ null） */
    setAccess(id: number, access: DeviceAccess): Device | null {
      db.prepare("UPDATE devices SET access = ? WHERE id = ?").run(access, id);
      return this.get(id);
    },
    /** 最後に使った時刻を進める（前に書いてから TOUCH_INTERVAL_SEC 経っていなければ書かない） */
    touch(id: number): void {
      db.prepare(
        `UPDATE devices SET last_used_at = ${NOW} WHERE id = ? AND (last_used_at IS NULL OR last_used_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-${TOUCH_INTERVAL_SEC} seconds'))`,
      ).run(id);
    },
    /** プッシュの宛先（なければ null） */
    push(id: number): DevicePush | null {
      const value = row(id)?.push;
      return value ? (JSON.parse(value) as DevicePush) : null;
    },
    /** プッシュの宛先を登録する・外す（null） */
    setPush(id: number, push: DevicePush | null): void {
      db.prepare("UPDATE devices SET push = ? WHERE id = ?").run(push === null ? null : JSON.stringify(push), id);
    },
    /** 取り消す（あったか） */
    remove(id: number): boolean {
      return Number(db.prepare("DELETE FROM devices WHERE id = ?").run(id).changes) > 0;
    },
  };
}
