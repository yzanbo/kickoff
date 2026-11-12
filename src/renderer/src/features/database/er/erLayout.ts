// ER 図の箱の大きさの見積もりと、自動の並べ方（elkjs の layered。並べる計算は Web Worker で動かし、画面を止めない）
import ELK from "elkjs/lib/elk-api";
import elkWorkerUrl from "elkjs/lib/elk-worker.min.js?url";
import type { DbErPositions, DbErTable } from "@shared/types";
import type { ErRelation } from "@shared/database/erDiagram";
import { ER_HEAD_HEIGHT, ER_PAD, ER_ROW_HEIGHT } from "./erBox";

/** 列の出し方（すべて / 主キーと外部キーだけ / テーブル名だけ） */
export type ErDetail = "all" | "keys" | "names";

const ER_MIN_WIDTH = 160;
const ER_MAX_WIDTH = 340;

/** 箱に出す列（keys なら主キー・外部キー・指される列だけ） */
export function erColumnsOf(table: DbErTable, detail: ErDetail, keyColumns: ReadonlySet<string>): DbErTable["columns"] {
  if (detail === "names") return [];
  if (detail === "all") return table.columns;
  return table.columns.filter((c) => c.primary_key || keyColumns.has(c.name));
}

/** 文字の幅のおおよそ（全角は 2 文字分） */
const textWidth = (s: string, px: number) => [...s].reduce((w, ch) => w + (ch.charCodeAt(0) > 0xff ? px * 1.8 : px), 0);

/** 箱の大きさの見積もり（並べる計算に渡す。描いたあとの実際の大きさとは少し違ってよい） */
export function erNodeSize(table: DbErTable, columns: DbErTable["columns"]): { width: number; height: number } {
  const head = textWidth(table.name, 7.4) + 44;
  const rows = columns.map((c) => textWidth(c.name, 6.8) + textWidth(c.type, 6.2) + 56);
  const width = Math.round(Math.min(ER_MAX_WIDTH, Math.max(ER_MIN_WIDTH, head, ...rows)));
  return { width, height: ER_HEAD_HEIGHT + columns.length * ER_ROW_HEIGHT + (columns.length > 0 ? ER_PAD : 0) };
}

let elk: InstanceType<typeof ELK> | null = null;

/** 自動で並べる（左から右へ、指される側を右に。つながりのないテーブルは下にまとめて並ぶ） */
export async function erAutoLayout(nodes: { id: string; width: number; height: number }[], relations: ErRelation[]): Promise<DbErPositions> {
  elk ??= new ELK({ workerUrl: elkWorkerUrl });
  const ids = new Set(nodes.map((n) => n.id));
  const graph = await elk.layout({
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "RIGHT",
      "elk.layered.spacing.nodeNodeBetweenLayers": "90",
      "elk.spacing.nodeNode": "40",
      "elk.spacing.componentComponent": "60",
      "elk.layered.nodePlacement.strategy": "BRANDES_KOEPF",
      "elk.separateConnectedComponents": "true",
    },
    children: nodes.map((n) => ({ id: n.id, width: n.width, height: n.height })),
    // 子（外部キーを持つ側）→ 親（指される側）の向き。親が右に並ぶ
    edges: relations.filter((r) => ids.has(r.from) && ids.has(r.to) && r.from !== r.to).map((r) => ({ id: r.id, sources: [r.from], targets: [r.to] })),
  });
  const positions: DbErPositions = {};
  for (const c of graph.children ?? []) positions[c.id] = { x: Math.round(c.x ?? 0), y: Math.round(c.y ?? 0) };
  return positions;
}
