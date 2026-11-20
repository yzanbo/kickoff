// 表の土台: 列の種類を 1 か所に宣言し、行 ⇄ 型の変換・読み書き・並べ替え・次の位置・古いものを消す・隠す行を持つ
// 列の名前は宣言からだけ SQL に入れ、値は必ず ? で渡す。prepare した文は SQL の文字ごとに覚える
import type { DatabaseSync, SQLInputValue, SQLOutputValue, StatementSync } from "node:sqlite";
import { NotFound } from "@/foundation/core/errors";
import { NOW } from "./schema";

type Kind = "int" | "real" | "text" | "bool" | "json" | "time";

export interface Col<T, K extends Kind = Kind, H extends boolean = boolean> {
  readonly kind: K;
  readonly canBeNull: boolean;
  /** 店の中だけの列（行の型に出さない。trashed_at・ai_generation など） */
  readonly isHidden: H;
  /** 型だけの印（値は持たない） */
  readonly __type?: T;
  nullable(): Col<T | null, K, H>;
  hidden(): Col<T, K, true>;
}

function makeCol<T, K extends Kind, H extends boolean>(kind: K, canBeNull: boolean, isHidden: H): Col<T, K, H> {
  return {
    kind,
    canBeNull,
    isHidden,
    nullable: () => makeCol<T | null, K, H>(kind, true, isHidden),
    hidden: () => makeCol<T, K, true>(kind, canBeNull, true),
  };
}

export const col = {
  int: () => makeCol<number, "int", false>("int", false, false),
  real: () => makeCol<number, "real", false>("real", false, false),
  text: <T extends string = string>() => makeCol<T, "text", false>("text", false, false),
  /** DB は 0 / 1 */
  bool: () => makeCol<boolean, "bool", false>("bool", false, false),
  /** DB は JSON の文字（読むときに JSON.parse、書くときに JSON.stringify） */
  json: <T>() => makeCol<T, "json", false>("json", false, false),
  /** ISO 8601 の文字（NOW で入れる） */
  time: () => makeCol<string, "time", false>("time", false, false),
};

/** 列の束（値の型は unknown で受け、行の型は RowOf で引き直す） */
type Columns = Record<string, Col<unknown, Kind, boolean>>;

/** 列の宣言から作る行の型（hidden の列は出さない） */
export type RowOf<C extends Columns> = {
  [K in keyof C as C[K] extends Col<unknown, Kind, true> ? never : K]: C[K] extends Col<infer T, Kind, boolean> ? T : never;
};

export interface TableOptions {
  /** 行を引く列（既定 "id"） */
  key?: string;
  /** 既定で隠す行（{ column: "trashed_at" } → WHERE trashed_at IS NULL。隠した行も扱うときは raw） */
  hide?: { column: string };
  /** 既定の並び（"position, id" など） */
  order?: string;
  /** 並べ替え・次の位置（base は始まりの番号。group はその列ごとに別の並び） */
  position?: { column: string; base: 0 | 1; group?: string };
  /** update のたびに NOW に進める列（"updated_at"） */
  touch?: string;
}

export type TableChange<Row> = { kind: "upsert"; row: Row } | { kind: "delete"; id: number | string };

export interface TableStore<Row> {
  get(id: number | string): Row | undefined;
  list(where?: string, params?: SQLInputValue[]): Row[];
  one(where: string, params?: SQLInputValue[]): Row | undefined;
  /** 宣言にある列だけを入れる（undefined の項目は DB の既定。position の列を省くと次の位置） */
  insert(values: Partial<Record<string, unknown>>): Row;
  /** undefined の項目は変えない。touch の列を進める。ない行は NotFound */
  update(id: number | string, patch: Partial<Record<string, unknown>>): Row;
  remove(id: number | string): boolean;
  /** ids の順に並べ直す（書いていない行は、いまの順のまま後ろに続ける。重なり・知らない ID は捨てる）。位置が変わった行だけ書いて知らせる */
  reorder(ids: readonly (number | string)[], group?: SQLInputValue): Row[];
  nextPosition(group?: SQLInputValue): number;
  /** 新しい順（既定は入れた順の逆）に keep 件だけ残す */
  pruneKeep(opts: { keep: number; group?: { column: string; value: SQLInputValue }; order?: string }): void;
  /** 隠した行も読む（ゴミ箱の操作） */
  raw: { get(id: number | string): Row | undefined; list(where?: string, params?: SQLInputValue[]): Row[] };
  fromRow(r: Record<string, SQLOutputValue>): Row;
  toRow(patch: Partial<Row>): Record<string, SQLInputValue>;
}

export interface TableDef<C extends Columns, Row = RowOf<C>> {
  readonly name: string;
  readonly columns: C;
  /** DB につないだ店を作る（notify は書いた行・消した ID の知らせ） */
  on(db: Pick<DatabaseSync, "prepare">, notify?: (change: TableChange<Row>) => void): TableStore<Row>;
}

function decode(c: Col<unknown>, v: SQLOutputValue): unknown {
  if (v === null || v === undefined) return null;
  switch (c.kind) {
    case "bool":
      return Number(v) === 1;
    case "json":
      return JSON.parse(String(v));
    case "int":
    case "real":
      return Number(v);
    default:
      return String(v);
  }
}

function encode(c: Col<unknown>, v: unknown): SQLInputValue {
  if (v === null) return null;
  switch (c.kind) {
    case "bool":
      return v ? 1 : 0;
    case "json":
      return JSON.stringify(v);
    default:
      return v as SQLInputValue;
  }
}

export function table<C extends Columns>(name: string, columns: C, opts: TableOptions = {}): TableDef<C> {
  type Row = RowOf<C>;
  const key = opts.key ?? "id";
  const visible = Object.entries(columns).filter(([, c]) => !c.isHidden);
  const hideWhere = opts.hide ? `${opts.hide.column} IS NULL` : null;
  const orderBy = opts.order ? ` ORDER BY ${opts.order}` : "";

  const fromRow = (r: Record<string, SQLOutputValue>): Row => {
    const row: Record<string, unknown> = {};
    for (const [k, c] of visible) if (k in r) row[k] = decode(c, r[k]);
    return row as Row;
  };
  /** 宣言にある列（hidden も）のうち undefined でない項目を DB の値にする */
  const encodeAll = (values: Partial<Record<string, unknown>>): Record<string, SQLInputValue> => {
    const out: Record<string, SQLInputValue> = {};
    for (const [k, v] of Object.entries(values)) {
      const c = columns[k];
      if (c && v !== undefined) out[k] = encode(c, v);
    }
    return out;
  };

  return {
    name,
    columns,
    on(db, notify) {
      const statements = new Map<string, StatementSync>();
      const prep = (sql: string) => {
        let s = statements.get(sql);
        if (!s) statements.set(sql, (s = db.prepare(sql)));
        return s;
      };
      const select = (conds: (string | null)[], params: SQLInputValue[], order = orderBy) => {
        const where = conds.filter((x): x is string => x !== null).map((x) => `(${x})`);
        const sql = `SELECT * FROM ${name}${where.length ? ` WHERE ${where.join(" AND ")}` : ""}${order}`;
        return (prep(sql).all(...params) as Record<string, SQLOutputValue>[]).map(fromRow);
      };
      const rawGet = (id: number | string) => select([`${key} = ?`], [id], "")[0];
      const get = (id: number | string) => select([`${key} = ?`, hideWhere], [id], "")[0];
      const list = (where?: string, params: SQLInputValue[] = []) => select([hideWhere, where ?? null], params);
      const pos = opts.position;
      const nextPosition = (group?: SQLInputValue): number => {
        if (!pos) throw new Error(`${name} は並びを持たない表です`);
        const where = pos.group ? ` WHERE ${pos.group} IS ?` : "";
        const sql = `SELECT COALESCE(MAX(${pos.column}), ${pos.base - 1}) + 1 AS next FROM ${name}${where}`;
        return Number((prep(sql).get(...(pos.group ? [group ?? null] : [])) as { next: number }).next);
      };
      const changed = (row: Row) => notify?.({ kind: "upsert", row });

      return {
        get,
        list,
        one: (where, params) => list(where, params)[0],
        insert(values) {
          const v = encodeAll(values);
          if (pos && v[pos.column] === undefined) v[pos.column] = nextPosition(pos.group ? v[pos.group] : undefined);
          const cols = Object.keys(v);
          const sql = cols.length
            ? `INSERT INTO ${name} (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`
            : `INSERT INTO ${name} DEFAULT VALUES`;
          const { lastInsertRowid } = prep(sql).run(...cols.map((k) => v[k]));
          const id = v[key] ?? Number(lastInsertRowid);
          const row = rawGet(id as number | string)!;
          changed(row);
          return row;
        },
        update(id, patch) {
          const v = encodeAll(patch);
          delete v[key];
          const sets = [...Object.keys(v).map((k) => `${k} = ?`), ...(opts.touch ? [`${opts.touch} = ${NOW}`] : [])];
          if (sets.length) prep(`UPDATE ${name} SET ${sets.join(", ")} WHERE ${key} = ?`).run(...Object.values(v), id);
          const row = rawGet(id);
          if (!row) throw new NotFound(`${name} に ${id} がありません`);
          changed(row);
          return row;
        },
        remove(id) {
          const { changes } = prep(`DELETE FROM ${name} WHERE ${key} = ?`).run(id);
          if (Number(changes) === 0) return false;
          notify?.({ kind: "delete", id });
          return true;
        },
        reorder(ids, group) {
          if (!pos) throw new Error(`${name} は並びを持たない表です`);
          const scope = pos.group ? `${pos.group} IS ?` : null;
          const params = pos.group ? [group ?? null] : [];
          const current = list(scope ?? undefined, params) as Record<string, unknown>[];
          const known = new Set(current.map((r) => r[key]));
          const head = [...new Set(ids)].filter((id) => known.has(id));
          const rest = current.map((r) => r[key] as number | string).filter((id) => !head.includes(id));
          const before = new Map(current.map((r) => [r[key], r[pos.column]]));
          const write = prep(`UPDATE ${name} SET ${pos.column} = ? WHERE ${key} = ?`);
          [...head, ...rest].forEach((id, i) => {
            if (before.get(id) === pos.base + i) return;
            write.run(pos.base + i, id);
            changed(rawGet(id)!);
          });
          return list(scope ?? undefined, params);
        },
        nextPosition,
        pruneKeep({ keep, group, order }) {
          const where = group ? ` WHERE ${group.column} = ?` : "";
          const sql = `DELETE FROM ${name}${group ? ` WHERE ${group.column} = ? AND` : " WHERE"} rowid NOT IN (SELECT rowid FROM ${name}${where} ORDER BY ${order ?? "rowid DESC"} LIMIT ?)`;
          prep(sql).run(...(group ? [group.value, group.value] : []), keep);
        },
        raw: { get: rawGet, list: (where, params = []) => select([where ?? null], params) },
        fromRow,
        toRow: (patch) => encodeAll(patch as Partial<Record<string, unknown>>),
      };
    },
  };
}
