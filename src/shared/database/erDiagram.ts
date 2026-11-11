// ER 図の決まり（純粋な関数。画面の図と Mermaid の書き出しで共通）: テーブルの形・関係（外部キーと、制約のない関係の推測）・多さ・まわりの絞り込み
import type { DbErTable, DbObjectPath, DbTableDetail } from "../types";

/** ER 図の配置を覚える場所のキー（DB とスキーマ。SQLite などで両方なければ main） */
export function erPlace(path: DbObjectPath): string {
  return [path.database, path.schema].filter(Boolean).join(".") || "main";
}

/** テーブルの詳細から ER 図の形を作る（ワーカーが木と同じ詳細から作る） */
export function erTableOf(name: string, detail: DbTableDetail): DbErTable {
  const pk = detail.columns.filter((c) => c.primary_key).map((c) => c.name);
  const uniques = detail.indexes.filter((i) => i.unique && !i.primary && i.columns.length > 0).map((i) => i.columns);
  return {
    name,
    kind: detail.kind,
    comment: detail.comment,
    columns: detail.columns.map((c) => ({ name: c.name, type: c.type, nullable: c.nullable, primary_key: c.primary_key })),
    foreign_keys: detail.foreign_keys,
    unique_sets: pk.length > 0 ? [pk, ...uniques] : uniques,
  };
}

/** 多さ: 子の側（外部キーを持つ側）が 1 か多か、親の側が必ずあるか（NULL を許せば 0 か 1） */
export interface ErCardinality {
  /** 子の側: one = 1 対 1（外部キーの列が一意）/ many = 1 対多 */
  child: "one" | "many";
  /** 親の側: required = 必ずある / optional = NULL を許す（0 か 1） */
  parent: "required" | "optional";
}

/** テーブルの間の関係（外部キー、または制約のない関係の推測） */
export interface ErRelation {
  /** 線のキー（同じ組でも列が違えば別） */
  id: string;
  /** 外部キーを持つ側 */
  from: string;
  fromColumns: string[];
  /** 指される側 */
  to: string;
  toColumns: string[];
  /** 制約のない関係の推測（点線） */
  inferred: boolean;
  cardinality: ErCardinality;
}

/** 英語の単数形（user_id → users のようにテーブル名を探すため。よくある形だけ） */
function plurals(word: string): string[] {
  const w = word.toLowerCase();
  const list = [`${w}s`, w];
  if (/(s|x|z|ch|sh)$/.test(w)) list.push(`${w}es`);
  if (/[^aeiou]y$/.test(w)) list.push(`${w.slice(0, -1)}ies`);
  if (w.endsWith("person")) list.push(`${w.slice(0, -6)}people`);
  if (w.endsWith("child")) list.push(`${w}ren`);
  return list;
}

function cardinalityOf(table: DbErTable, columns: string[]): ErCardinality {
  const set = new Set(columns);
  const unique = table.unique_sets.some((u) => u.length === columns.length && u.every((c) => set.has(c)));
  const optional = columns.some((c) => table.columns.find((col) => col.name === c)?.nullable ?? true);
  return { child: unique ? "one" : "many", parent: optional ? "optional" : "required" };
}

/**
 * 図の関係: 外部キー（ほかの場所（スキーマ）のテーブルを指すものは、図にそのテーブルがあるときだけ）と、inferred なら制約のない関係の推測
 * （Rails・Laravel・SQLite でよくある「<テーブル名の単数>_id」の列 → そのテーブルの主キー id。外部キーのある列・自分自身を指すものは除く）
 */
export function erRelations(tables: DbErTable[], opts: { inferred: boolean }): ErRelation[] {
  const byName = new Map(tables.map((t) => [t.name, t]));
  const byLower = new Map(tables.map((t) => [t.name.toLowerCase(), t]));
  const relations: ErRelation[] = [];
  for (const t of tables) {
    for (const fk of t.foreign_keys) {
      if (!byName.has(fk.ref_table)) continue;
      relations.push({
        id: `fk:${t.name}:${fk.columns.join(",")}:${fk.ref_table}`,
        from: t.name,
        fromColumns: fk.columns,
        to: fk.ref_table,
        toColumns: fk.ref_columns,
        inferred: false,
        cardinality: cardinalityOf(t, fk.columns),
      });
    }
    if (!opts.inferred) continue;
    const withFk = new Set(t.foreign_keys.flatMap((f) => f.columns));
    for (const col of t.columns) {
      const m = /^(.+)_id$/i.exec(col.name);
      if (!m || withFk.has(col.name)) continue;
      const target = plurals(m[1]).map((n) => byLower.get(n)).find((x) => x && x.name !== t.name);
      if (!target) continue;
      const pk = target.columns.filter((c) => c.primary_key);
      if (pk.length !== 1 || pk[0].name.toLowerCase() !== "id") continue;
      relations.push({
        id: `guess:${t.name}:${col.name}:${target.name}`,
        from: t.name,
        fromColumns: [col.name],
        to: target.name,
        toColumns: [pk[0].name],
        inferred: true,
        cardinality: cardinalityOf(t, [col.name]),
      });
    }
  }
  return relations;
}

/** center から depth 段までつながったテーブル（向きは問わない。center 自身も含む） */
export function erNeighborhood(relations: ErRelation[], center: string, depth: number): Set<string> {
  const seen = new Set([center]);
  let frontier = [center];
  for (let i = 0; i < depth && frontier.length > 0; i++) {
    const next: string[] = [];
    for (const r of relations) {
      for (const [a, b] of [
        [r.from, r.to],
        [r.to, r.from],
      ] as const) {
        if (frontier.includes(a) && !seen.has(b)) {
          seen.add(b);
          next.push(b);
        }
      }
    }
    frontier = next;
  }
  return seen;
}

/** Mermaid の名前に使えない文字を _ にする（日本語の名前は引用符で別名を付ける） */
function mermaidName(name: string): string {
  return /^[A-Za-z_][\w-]*$/.test(name) ? name : `"${name.replace(/"/g, "'")}"`;
}

/** Mermaid の型に使える形（空白・括弧は使えないので _ に） */
function mermaidType(type: string): string {
  return type.replace(/[^\w]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "") || "unknown";
}

/**
 * Mermaid の erDiagram の文（「Mermaid でコピー」「メモに書き出す」）。detail で列の出し方（すべて / 主キーと外部キーだけ / 名前だけ）。
 * 推測の関係は点線（..）
 */
export function erMermaid(tables: DbErTable[], relations: ErRelation[], detail: "all" | "keys" | "names"): string {
  const lines = ["erDiagram"];
  const fkCols = new Map(tables.map((t) => [t.name, new Set(t.foreign_keys.flatMap((f) => f.columns))]));
  for (const t of tables) {
    const cols = detail === "names" ? [] : t.columns.filter((c) => detail === "all" || c.primary_key || fkCols.get(t.name)?.has(c.name));
    if (cols.length === 0) {
      lines.push(`  ${mermaidName(t.name)} {`, "  }");
      continue;
    }
    lines.push(`  ${mermaidName(t.name)} {`);
    for (const c of cols) {
      const keys = [c.primary_key ? "PK" : null, fkCols.get(t.name)?.has(c.name) ? "FK" : null].filter(Boolean).join(",");
      lines.push(`    ${mermaidType(c.type)} ${mermaidType(c.name)}${keys ? ` ${keys}` : ""}`);
    }
    lines.push("  }");
  }
  for (const r of relations) {
    const parent = r.cardinality.parent === "optional" ? "|o" : "||";
    const child = r.cardinality.child === "one" ? "o|" : "o{";
    const line = r.inferred ? ".." : "--";
    lines.push(`  ${mermaidName(r.to)} ${parent}${line}${child} ${mermaidName(r.from)} : "${r.fromColumns.join(", ")}${r.inferred ? "（推測）" : ""}"`);
  }
  return lines.join("\n");
}
