// チャットの家系（いちばん上の親チャットから下にぶら下がるチャットの全部）の、関係の呼び名（AI が家系のチャットを変えるツールで使う。純粋関数）

/**
 * 自分から見た相手の関係（自分 / 親 / 祖父母 / 子 / 孫 / 兄弟 / 兄弟の子 / 親の兄弟 / いとこ）。
 * パスは家系のいちばん上の親チャットから、そのチャット自身までの ID（同じ家系なら先頭が同じ）。
 * チャットは孫チャットまでなので家系は最大 3 段だが、深いものは「n 段上の祖先」「n 段下の子孫」「同じ家系」で返す
 */
export function familyRelation(selfPath: readonly number[], targetPath: readonly number[]): string {
  let common = 0;
  while (common < selfPath.length && common < targetPath.length && selfPath[common] === targetPath[common]) common++;
  // 共通の祖先から、自分・相手まで何段か
  const up = selfPath.length - common;
  const down = targetPath.length - common;
  if (up === 0 && down === 0) return "自分";
  if (up === 0) return down === 1 ? "子" : down === 2 ? "孫" : `${down} 段下の子孫`;
  if (down === 0) return up === 1 ? "親" : up === 2 ? "祖父母" : `${up} 段上の祖先`;
  if (up === 1 && down === 1) return "兄弟";
  if (up === 1 && down === 2) return "兄弟の子";
  if (up === 2 && down === 1) return "親の兄弟";
  if (up === 2 && down === 2) return "いとこ";
  return "同じ家系";
}

/** 親の ID で並んだチャットを、親のすぐ下に子が続く並び（子どうしは ID の順）にする。root から始め、たどれないものは入れない */
export function familyOrder<T extends { id: number; parent_chat_id: number | null }>(root: T, members: readonly T[]): T[] {
  const childrenOf = new Map<number, T[]>();
  for (const m of members) {
    if (m.id === root.id || m.parent_chat_id === null) continue;
    const list = childrenOf.get(m.parent_chat_id) ?? [];
    list.push(m);
    childrenOf.set(m.parent_chat_id, list);
  }
  const out: T[] = [];
  const seen = new Set<number>();
  const visit = (node: T) => {
    if (seen.has(node.id)) return;
    seen.add(node.id);
    out.push(node);
    for (const child of (childrenOf.get(node.id) ?? []).sort((a, b) => a.id - b.id)) visit(child);
  };
  visit(root);
  return out;
}
