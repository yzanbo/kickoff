/**
 * パネルの分割の配置の形（VS Code のエディターのグループと同じ）。葉 = ペイン、枝 = 分割の木で、タブの中身は持たずキーだけを指す。
 * ここは形・読み取り・木の詰め方。配置の変え方（開く・移す・分ける・閉じる・そろえる）は paneLayout.ts、割合は paneSizes.ts
 */

/** 分割の向き（row = 左右に並べる / column = 上下に並べる） */
export type SplitDir = "row" | "column";
/** 新しいペインを置く側（before = 左・上 / after = 右・下） */
export type SplitSide = "before" | "after";

/** ペイン: そのペインのタブのキーの並びと、表示中のタブ */
export interface PaneLeaf {
  type: "pane";
  id: string;
  tabs: string[];
  active: string | null;
}

/** 分割: 子の並びと、子ごとの大きさの割合（足すと 1） */
export interface PaneSplit {
  type: "split";
  dir: SplitDir;
  children: PaneNode[];
  sizes: number[];
}

export type PaneNode = PaneLeaf | PaneSplit;

/**
 * 配置の木と、ピントのあるペイン（最後に押した・操作したペイン。自分で開くタブはここに入れる）と、一覧のペイン
 * （サイドバーと連動して自動で足すチャットのタブを入れるペイン。分けた元のペイン。なければ・もうなければ左上のペイン。homePane）
 */
export interface PaneLayout {
  root: PaneNode;
  focused: string;
  home?: string;
}

/** 分けていないときの、最初のペインの ID */
export const FIRST_PANE = "pane:0";

/** すべてのタブが入った 1 つのペイン（分けていない初めの配置） */
export function singlePane(tabs: readonly string[], active: string | null, id = FIRST_PANE): PaneLayout {
  return { root: { type: "pane", id, tabs: [...tabs], active: active !== null && tabs.includes(active) ? active : (tabs[0] ?? null) }, focused: id };
}

/** ペインを画面の並び順（左上から）で */
export function leavesOf(node: PaneNode): PaneLeaf[] {
  return node.type === "pane" ? [node] : node.children.flatMap(leavesOf);
}

/** 右上のペイン（横に並べた分割ではいちばん右、縦に並べた分割ではいちばん上をたどる。タブの列の右端に欄の閉じるボタンを置くペイン） */
export function topRightPane(node: PaneNode): PaneLeaf {
  if (node.type === "pane") return node;
  return topRightPane(node.dir === "row" ? node.children[node.children.length - 1] : node.children[0]);
}

export const findPane = (layout: PaneLayout, id: string): PaneLeaf | undefined => leavesOf(layout.root).find((p) => p.id === id);

/** タブが入っているペイン */
export const paneOfTab = (layout: PaneLayout, key: string): PaneLeaf | undefined => leavesOf(layout.root).find((p) => p.tabs.includes(key));

/** ピントのあるペイン（なければ先頭） */
export const focusedPane = (layout: PaneLayout): PaneLeaf => findPane(layout, layout.focused) ?? leavesOf(layout.root)[0];

/**
 * 一覧のペイン: サイドバーと連動して自動で足すチャットのタブが入るペイン（分けたペインには自動で足さない）。
 * 覚えたペインがなければ（分けていない・閉じた）左上のペイン
 */
export const homePane = (layout: PaneLayout): PaneLeaf => (layout.home ? findPane(layout, layout.home) : undefined) ?? leavesOf(layout.root)[0];

/**
 * タブを閉じたあとに表示するタブ。閉じたのが表示中のタブなら、同じ位置に来たタブ（最後なら 1 つ前）。
 * ほかのタブを閉じたなら表示中のまま。タブがなくなれば null
 */
export function nextActiveTab(tabs: readonly string[], closedKey: string, activeTab: string | null): string | null {
  if (activeTab !== closedKey) return activeTab;
  const index = tabs.indexOf(closedKey);
  const rest = tabs.filter((t) => t !== closedKey);
  return rest[Math.min(index, rest.length - 1)] ?? null;
}

/** ピントのあるペインの表示中のタブ（今までの「表示中のタブ」と同じ意味） */
export const activeTabOf = (layout: PaneLayout): string | null => focusedPane(layout).active;

/** どこかのペインで表示中のタブか */
export const isTabVisible = (layout: PaneLayout, key: string): boolean => leavesOf(layout.root).some((p) => p.active === key);

/** 木のペインを置き換える（fn が null を返したらそのペインを外す）。外したあとは normalize で詰める */
export function mapLeaves(node: PaneNode, fn: (leaf: PaneLeaf) => PaneLeaf | null): PaneNode | null {
  if (node.type === "pane") return fn(node);
  const kept: { child: PaneNode; size: number }[] = [];
  node.children.forEach((c, i) => {
    const child = mapLeaves(c, fn);
    if (child) kept.push({ child, size: node.sizes[i] });
  });
  if (kept.length === 0) return null;
  return { ...node, children: kept.map((k) => k.child), sizes: kept.map((k) => k.size) };
}

/** 割合を足して 1 になるようにそろえる */
export function normalizeSizes(sizes: number[]): number[] {
  const total = sizes.reduce((a, b) => a + b, 0);
  return total > 0 ? sizes.map((s) => s / total) : sizes.map(() => 1 / sizes.length);
}

/** 木を詰める: 子が 1 つの分割はその子に置き換え、同じ向きの入れ子は 1 段にまとめ、割合をそろえ直す */
export function normalize(node: PaneNode): PaneNode {
  if (node.type === "pane") return node;
  const children: PaneNode[] = [];
  const sizes: number[] = [];
  const own = normalizeSizes(node.sizes);
  node.children.forEach((c, i) => {
    const child = normalize(c);
    if (child.type === "split" && child.dir === node.dir) {
      child.children.forEach((cc, j) => {
        children.push(cc);
        sizes.push(own[i] * child.sizes[j]);
      });
    } else {
      children.push(child);
      sizes.push(own[i]);
    }
  });
  if (children.length === 1) return children[0];
  return { ...node, children, sizes: normalizeSizes(sizes) };
}

/** 新しい木にする。ピントのあるペインがなくなっていたら先頭へ（一覧のペインの覚えはそのまま。なくなっていれば homePane が左上にする） */
export function withFocus(root: PaneNode, layout: PaneLayout): PaneLayout {
  const leaves = leavesOf(root);
  return { ...layout, root, focused: leaves.some((p) => p.id === layout.focused) ? layout.focused : leaves[0].id };
}
