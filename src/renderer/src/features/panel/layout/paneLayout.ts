import {
  findPane,
  focusedPane,
  homePane,
  leavesOf,
  mapLeaves,
  nextActiveTab,
  normalize,
  paneOfTab,
  singlePane,
  withFocus,
  type PaneLayout,
  type PaneLeaf,
  type PaneNode,
  type SplitDir,
  type SplitSide,
} from "./paneTree";

/**
 * パネルの分割の配置の変え方（タブを開く・移す・一覧のペインへ戻す・ペインを分ける・閉じる・いまのタブにそろえる）。
 * どれも新しい配置を返す純粋関数（パネルの reducer から呼ぶ）。配置の形と読み取りは paneTree.ts
 */

/**
 * タブをペインから外す。外したペインが空になったら、そのペインを消して木を詰める（keep のペインと、最後の 1 つは残す）。
 * 消したペインにピントがあったら、残ったペインの先頭へ
 */
function detach(layout: PaneLayout, key: string, keep?: string): PaneLayout {
  const source = paneOfTab(layout, key);
  if (!source) return layout;
  const many = leavesOf(layout.root).length > 1;
  const root = mapLeaves(layout.root, (p) => {
    if (p.id !== source.id) return p;
    const tabs = p.tabs.filter((t) => t !== key);
    if (tabs.length === 0 && many && p.id !== keep) return null;
    return { ...p, tabs, active: nextActiveTab(p.tabs, key, p.active) };
  });
  return withFocus(normalize(root ?? layout.root), layout);
}

/** タブをペインの index の位置（なければ最後）に入れて表示し、ピントもそこへ移す */
function insert(layout: PaneLayout, paneId: string, key: string, index?: number): PaneLayout {
  const root = mapLeaves(layout.root, (p) => {
    if (p.id !== paneId) return p;
    const tabs = [...p.tabs];
    tabs.splice(index === undefined ? tabs.length : Math.max(0, Math.min(index, tabs.length)), 0, key);
    return { ...p, tabs, active: key };
  });
  return { ...layout, root: root ?? layout.root, focused: paneId };
}

/**
 * タブを開く: すでにどこかのペインにあれば、そのペインで表示してピントを移す（もうそうなっていれば同じ配置を返す）。
 * なければピントのあるペインに足して表示する
 */
export function placeTab(layout: PaneLayout, key: string): PaneLayout {
  const at = paneOfTab(layout, key);
  if (at?.active === key && layout.focused === at.id) return layout;
  if (at) return { ...layout, root: mapLeaves(layout.root, (p) => (p.id === at.id ? { ...p, active: key } : p)) ?? layout.root, focused: at.id };
  return insert(layout, focusedPane(layout).id, key);
}

/**
 * タブを表に出さずに足す（AI がブラウザのタブを開いたとき。利用者が見ているタブ・ピントは変えない）。
 * ピントのあるペインの最後に足し、そのペインが空なら表示する。もうどこかにあれば同じ配置を返す
 */
export function addTabBehind(layout: PaneLayout, key: string): PaneLayout {
  if (paneOfTab(layout, key)) return layout;
  const target = focusedPane(layout);
  const root = mapLeaves(layout.root, (p) => (p.id === target.id ? { ...p, tabs: [...p.tabs, key], active: p.active ?? key } : p));
  return { ...layout, root: root ?? layout.root };
}

/** タブのキーを変える（送った新しいチャットのタブを、できたチャットのタブにするとき。置き場所と表示中かはそのまま） */
export function renameTab(layout: PaneLayout, from: string, to: string): PaneLayout {
  if (from === to || !paneOfTab(layout, from)) return layout;
  const root = mapLeaves(layout.root, (p) =>
    p.tabs.includes(from) ? { ...p, tabs: p.tabs.map((t) => (t === from ? to : t)), active: p.active === from ? to : p.active } : p,
  );
  return { ...layout, root: root ?? layout.root };
}

/** ピントをペインへ移す（同じなら同じ配置を返し、描き直さない） */
export function focusPane(layout: PaneLayout, paneId: string): PaneLayout {
  return layout.focused === paneId || !findPane(layout, paneId) ? layout : { ...layout, focused: paneId };
}

/**
 * タブを別のペイン（同じペインなら並べ替え）の index の位置へ移す。index は移す前の並びでの位置（なければ最後）。
 * 移した結果、元のペインが空になったら消して木を詰める
 */
export function moveTab(layout: PaneLayout, key: string, paneId: string, index?: number): PaneLayout {
  const source = paneOfTab(layout, key);
  const target = findPane(layout, paneId);
  if (!source || !target) return layout;
  let at = index;
  // 同じペインの中で後ろへ移すときは、自分を抜いた分だけ前にずれる
  if (source.id === target.id && at !== undefined && at > source.tabs.indexOf(key)) at -= 1;
  return insert(detach(layout, key, paneId), paneId, key, at);
}

/**
 * タブを一覧のペインへ戻す（分けたペインで、サイドバーと連動したチャットのタブを閉じたとき）。一覧のペインでは後ろに足すだけで、
 * 表示中のタブ・ピントは変えない（戻したチャットに一覧の表示を奪わせない）。元のペインが空になったら消して詰める。一覧のペインにあれば何もしない
 */
export function returnToHome(layout: PaneLayout, key: string): PaneLayout {
  const source = paneOfTab(layout, key);
  if (!source || source.id === homePane(layout).id) return layout;
  const detached = detach(layout, key);
  const home = homePane(detached).id;
  const root = mapLeaves(detached.root, (p) => (p.id === home ? { ...p, tabs: [...p.tabs, key], active: p.active ?? key } : p));
  return { ...detached, root: root ?? detached.root };
}

/** 木の中のペインを、新しいペインと並べた分割に置き換える（同じ向きの親があれば、その中に並べる） */
function splitLeaf(node: PaneNode, paneId: string, dir: SplitDir, side: SplitSide, fresh: PaneLeaf): PaneNode {
  if (node.type === "pane") {
    if (node.id !== paneId) return node;
    return { type: "split", dir, children: side === "before" ? [fresh, node] : [node, fresh], sizes: [0.5, 0.5] };
  }
  const index = node.children.findIndex((c) => c.type === "pane" && c.id === paneId);
  if (index >= 0 && node.dir === dir) {
    // 元のペインの大きさを半分ずつに分ける
    const half = node.sizes[index] / 2;
    const at = side === "before" ? index : index + 1;
    const children = [...node.children];
    children.splice(at, 0, fresh);
    const sizes = [...node.sizes];
    sizes.splice(index, 1, half, half);
    return { ...node, children, sizes };
  }
  return { ...node, children: node.children.map((c) => splitLeaf(c, paneId, dir, side, fresh)) };
}

/**
 * ペインを分ける: paneId の隣（dir の向きの side の側）に newId のペインを作り、tabKey があればそこへ移して表示する（なければ空のペイン）。
 * ピントは新しいペインへ。移したタブの元のペインが空になったら消す（分けた元のペインは空でも残す）
 */
export function splitPane(layout: PaneLayout, paneId: string, dir: SplitDir, side: SplitSide, newId: string, tabKey?: string): PaneLayout {
  if (!findPane(layout, paneId) || findPane(layout, newId)) return layout;
  const base = tabKey && paneOfTab(layout, tabKey) ? detach(layout, tabKey, paneId) : layout;
  // 元のペインが消えた（移したタブのペインが別で、空になった）場合でも、分ける先のペインは keep で残っている
  const fresh: PaneLeaf = { type: "pane", id: newId, tabs: tabKey && paneOfTab(layout, tabKey) ? [tabKey] : [], active: null };
  fresh.active = fresh.tabs[0] ?? null;
  // 分ける前の一覧のペインを覚えておく（左・上に分けても、一覧のペインが新しいペインに移らないように）
  return { root: normalize(splitLeaf(base.root, paneId, dir, side, fresh)), focused: newId, home: homePane(layout).id };
}

/**
 * タブを閉じる（いくつかまとめて）。各ペインの表示中のタブは、閉じたのが表示中なら同じ位置に来たタブへ。
 * 閉じた結果空になったペインは消す（最後の 1 つは残す）
 */
export function closeLayoutTabs(layout: PaneLayout, keys: readonly string[]): PaneLayout {
  return keys.reduce((l, key) => detach(l, key), layout);
}

/**
 * ペインを閉じる（最後の 1 つは閉じない）。中にあったタブのうち keep のもの（サイドバーと連動したチャット）は一覧のペインへ戻し
 * （一覧のペインを閉じたときは、残ったペインの左上が新しい一覧のペイン）、残りのキーを closed で返す（呼び出し側でタブも閉じる）
 */
export function closePane(layout: PaneLayout, paneId: string, keep: (key: string) => boolean = () => false): { layout: PaneLayout; closed: string[] } {
  const pane = findPane(layout, paneId);
  const leaves = leavesOf(layout.root);
  if (!pane || leaves.length <= 1) return { layout, closed: [] };
  const root = normalize(mapLeaves(layout.root, (p) => (p.id === paneId ? null : p)) ?? layout.root);
  // ピントは閉じたペインの隣（並び順で前、先頭なら次）へ
  const index = leaves.findIndex((p) => p.id === paneId);
  const neighbor = leaves[index > 0 ? index - 1 : 1].id;
  let next: PaneLayout = { ...layout, root, focused: layout.focused === paneId ? neighbor : layout.focused };
  const back = pane.tabs.filter(keep);
  if (back.length > 0) {
    const home = homePane(next).id;
    next = { ...next, root: mapLeaves(next.root, (p) => (p.id === home ? { ...p, tabs: [...p.tabs, ...back], active: p.active ?? back[0] } : p)) ?? next.root };
  }
  return { layout: next, closed: pane.tabs.filter((t) => !back.includes(t)) };
}

/**
 * 覚えていた配置を、いまのタブに合わせて直す: ないタブのキーは外し（2 つのペインにあれば先のほうだけ残す）、
 * どのペインにもないタブ（サイドバーと連動して自動で足したチャットなど）は一覧のペインに足す（自分で開くタブは placeTab でピントのあるペインに入る。
 * 以前はここもピントのあるペインで、1 つのタブだけを見せるために分けたペインに、ほかのチャットが流れ込んでいた）。
 * 表示中のタブ・ピントのあるペインがなくなっていれば先頭にする
 */
export function reconcileLayout(layout: PaneLayout, keys: readonly string[]): PaneLayout {
  const exists = new Set(keys);
  const seen = new Set<string>();
  const many = leavesOf(layout.root).length > 1;
  const root = mapLeaves(layout.root, (p) => {
    const tabs = p.tabs.filter((t) => exists.has(t) && !seen.has(t));
    tabs.forEach((t) => seen.add(t));
    // 中身がなくなった（タブがすべて消えた）ペインは詰める。もとから空のペインはそのまま残す
    if (tabs.length === 0 && p.tabs.length > 0 && many) return null;
    const same = tabs.length === p.tabs.length && (p.active === null ? tabs.length === 0 : tabs.includes(p.active));
    return same ? p : { ...p, tabs, active: p.active !== null && tabs.includes(p.active) ? p.active : (tabs[0] ?? null) };
  });
  let fixed = root ? withFocus(normalize(root), layout) : singlePane([], null);
  const missing = keys.filter((k) => !seen.has(k));
  if (missing.length > 0) {
    const target = homePane(fixed).id;
    fixed = {
      ...fixed,
      root: mapLeaves(fixed.root, (p) => (p.id === target ? { ...p, tabs: [...p.tabs, ...missing], active: p.active ?? missing[0] } : p)) ?? fixed.root,
    };
  }
  return fixed;
}
