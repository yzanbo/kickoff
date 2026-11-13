// ワークツリーの名前から作る名前（埋め込みブラウザの <名前>.localhost と、Docker の組の名前。純粋な関数）

/** 小文字・数字・ハイフンだけにする（ほかの文字は - に。続く - は 1 つ、頭と終わりの - は落とす） */
const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/** 埋め込みブラウザで開く名前（feat/x → feat-x.localhost。DNS の 1 段は 63 文字まで。使える文字がなければ wt） */
export function browserHostOf(name: string): string {
  const label = slug(name).slice(0, 63).replace(/-+$/, "") || "wt";
  return `${label}.localhost`;
}

/**
 * Docker の組の名前（<本来の名前>-<ブランチ名>）。compose が許すのは小文字・数字・- と _ で、頭は英数字
 */
export function composeProjectNameOf(base: string, branch: string): string {
  const head = base.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^[^a-z0-9]+/, "");
  const tail = slug(branch) || "wt";
  return head ? `${head}-${tail}` : tail;
}
