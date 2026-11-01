/** グラフの線の 1 本（行の上半分・下半分。from の列から to の列へ） */
export interface GraphEdge {
  from: number;
  to: number;
  /** 線の色の番号（ブランチごと） */
  color: number;
}

/** 履歴の 1 行のグラフ（col: コミットの点の列） */
export interface GraphRow {
  col: number;
  color: number;
  /** 行の上端から点の高さまで */
  top: GraphEdge[];
  /** 点の高さから行の下端まで */
  bottom: GraphEdge[];
}

/**
 * 履歴のグラフ（Fork・VS Code と同じく、列ごとに「次に来るコミット」を待つ線を引く）。
 * commits は子が親より先に並んでいること（git log --topo-order）。lanes はいちばん広いところの列の数
 */
export function layoutGraph(commits: { hash: string; parents: string[] }[]): { rows: GraphRow[]; lanes: number } {
  // 列ごとに、次に来るはずのコミットと、その線の色
  const lanes: (string | null)[] = [];
  const colors: number[] = [];
  let nextColor = 0;
  let width = 0;
  const freeSlot = () => {
    const i = lanes.indexOf(null);
    return i >= 0 ? i : lanes.length;
  };
  const rows: GraphRow[] = [];

  for (const commit of commits) {
    let col = lanes.indexOf(commit.hash);
    if (col < 0) {
      // どの線も待っていない（ブランチの先頭）: 空いている列に置く
      col = freeSlot();
      lanes[col] = commit.hash;
      colors[col] = nextColor++;
    }
    const color = colors[col];
    // 上半分: この点に集まる線と、そのまま通り過ぎる線
    const top: GraphEdge[] = [];
    lanes.forEach((hash, i) => {
      if (hash !== null) top.push({ from: i, to: hash === commit.hash ? col : i, color: colors[i] });
    });
    const before = lanes.slice();
    for (let i = 0; i < lanes.length; i++) if (i !== col && lanes[i] === commit.hash) lanes[i] = null;

    // 下半分: 親へ伸びる線（1 つ目の親は同じ列を引き継ぐ。ほかの線がもう待っていれば、そちらへつなぐ）
    const targets: number[] = [];
    // ほかの列から、この列へ合流させる線（本流を左の列に保つため）
    const joins: GraphEdge[] = [];
    const [first, ...others] = commit.parents;
    if (first === undefined) {
      lanes[col] = null;
    } else {
      const waiting = lanes.indexOf(first);
      if (waiting >= 0 && waiting < col) {
        // 左の列がもう待っている: そちらへつなぐ
        lanes[col] = null;
        targets.push(waiting);
      } else {
        // 右の列が待っていれば、その線をこの列へ合流させ、本流をこの列に残す
        if (waiting > col) {
          joins.push({ from: waiting, to: col, color: colors[waiting] });
          lanes[waiting] = null;
        }
        lanes[col] = first;
        targets.push(col);
      }
    }
    for (const parent of others) {
      let target = lanes.indexOf(parent);
      if (target < 0) {
        target = freeSlot();
        lanes[target] = parent;
        colors[target] = nextColor++;
      }
      targets.push(target);
    }
    const bottom: GraphEdge[] = [...targets.map((to) => ({ from: col, to, color: colors[to] })), ...joins];
    lanes.forEach((hash, i) => {
      if (hash !== null && !targets.includes(i) && before[i] === hash) bottom.push({ from: i, to: i, color: colors[i] });
    });
    while (lanes.length > 0 && lanes[lanes.length - 1] === null) lanes.pop();
    width = Math.max(width, before.length, lanes.length, col + 1);
    rows.push({ col, color, top, bottom });
  }
  return { rows, lanes: width };
}
