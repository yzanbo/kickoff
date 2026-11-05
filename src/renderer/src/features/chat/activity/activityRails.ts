// 動きの行の左の線（Git のグラフと同じ考え方）: メインの線から、起動した行でサブエージェントの線が枝分かれし、終わりの行で閉じる。純粋な関数
import type { ActivityRow } from "./activityRows";

/** 1 行の中の縦の線（top = 行の上の端から、node = 節（行の 1 行目の高さ）から / bottom = 行の下の端まで、node = 節まで） */
export interface RailSegment {
  col: number;
  /** 線の持ち主（メイン = null、サブエージェント = 一覧の行のキー。色を決める） */
  agent: string | null;
  from: "top" | "node";
  to: "bottom" | "node";
}

/** 1 行の線（col = 行の持ち主の列 = 節を置く列。branch = 起動した子の列へ、節の高さで横に分かれる線） */
export interface RailRow {
  col: number;
  segments: RailSegment[];
  branch?: { from: number; to: number; agent: string };
}

export interface RailLayout {
  rows: RailRow[];
  /** 使う列の数（線の欄の幅） */
  width: number;
}

/**
 * 行ごとの線を決める。列は使うときに、空いている左からの列を取る（起動した子は、起動した親より右の空いている列）。
 * 終わりの行（end）のあとは列を空け、あとから起動したものが使い回す。起動の行のない持ち主（絞り込んだ・記録を巻き戻した）は、
 * その最初の行の節から線を始める。絞り込みで行のない子へは枝分かれしない
 */
export function layoutRails(rows: readonly Pick<ActivityRow, "agent" | "kind" | "child">[]): RailLayout {
  const present = new Set(rows.map((r) => r.agent));
  // 持ち主ごとの終わりの行（その節で線を閉じる。ないもの（メイン・実行中）は最後まで）
  const closesAt = new Map<string | null, number>();
  rows.forEach((r, i) => {
    if (r.kind === "end") closesAt.set(r.agent, i);
  });
  const used: boolean[] = [];
  const colOf = new Map<string | null, number>();
  const take = (agent: string | null, min: number) => {
    let c = min;
    while (used[c]) c++;
    used[c] = true;
    colOf.set(agent, c);
    return c;
  };
  let width = 0;
  const out: RailRow[] = rows.map((row, i) => {
    const before = new Map(colOf);
    const fresh = !before.has(row.agent);
    const col = fresh ? take(row.agent, 0) : before.get(row.agent)!;
    const segments: RailSegment[] = [];
    for (const [agent, c] of colOf) {
      if (agent === row.agent) segments.push({ col: c, agent, from: fresh ? "node" : "top", to: closesAt.get(agent) === i ? "node" : "bottom" });
      else segments.push({ col: c, agent, from: "top", to: "bottom" });
    }
    let branch: RailRow["branch"];
    if (row.kind === "launch" && row.child !== undefined && present.has(row.child) && !colOf.has(row.child)) {
      const to = take(row.child, col + 1);
      segments.push({ col: to, agent: row.child, from: "node", to: "bottom" });
      branch = { from: col, to, agent: row.child };
    }
    width = Math.max(width, ...segments.map((s) => s.col + 1));
    // 終わった持ち主の列を空ける（次の行から使い回せる）
    if (closesAt.get(row.agent) === i) {
      used[col] = false;
      colOf.delete(row.agent);
    }
    return { col, segments, ...(branch ? { branch } : {}) };
  });
  return { rows: out, width };
}
