// ページの中の文字を探す欄（FindBar）の、文字を集めて印を付ける部分。
// ページの中の同じオリジンの iframe（HTML のメモのページなど）の中の文字も探し、印はそれぞれの文書に付ける
// （CSS Custom Highlight API は文書ごとなので、iframe の中には印の色の CSS も置く）

/** 印の名前（CSS の ::highlight(pane-find) / ::highlight(pane-find-current)） */
const ALL = "pane-find";
const CURRENT = "pane-find-current";

/** 探すときに入らない要素（入力欄・見えないもの・検索の欄そのもの） */
const SKIP = "input, textarea, script, style, [hidden], .pane-find";

/** iframe の中に置く、印の色の CSS（画面の CSS の変数は iframe の中にないので、色はいまの値を書き込む） */
const FRAME_STYLE_ID = "kickoff-pane-find-style";

/** 要素の中の、見えている文字のノード（中の同じオリジンの iframe の文書の中も、並んでいる順に） */
export function findTextNodes(root: HTMLElement): Text[] {
  const nodes: Text[] = [];
  const walk = (el: Element) => {
    const doc = el.ownerDocument;
    const walker = doc.createTreeWalker(el, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
      acceptNode: (node) => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          // iframe はここで中へ入る（木の中の要素は飛ばして、その下の文字を見る）
          if ((node as Element).tagName === "IFRAME") walkFrame(node as HTMLIFrameElement);
          return NodeFilter.FILTER_SKIP;
        }
        const parent = node.parentElement;
        if (!parent || !node.nodeValue?.trim() || parent.closest(SKIP) || !parent.checkVisibility()) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n as Text);
  };
  const walkFrame = (frame: HTMLIFrameElement) => {
    if (!frame.checkVisibility()) return;
    // ほかのオリジンの iframe は中に触れない（contentDocument が null）
    const body = frame.contentDocument?.body;
    if (body) walk(body);
  };
  walk(root);
  return nodes;
}

/** 文書の窓（印を付ける先）。iframe の窓の CSS・Highlight は、その窓のもの */
type MarkWindow = Window & { CSS?: typeof CSS; Highlight?: typeof Highlight };
const windowOf = (node: Node) => (node.ownerDocument?.defaultView ?? null) as MarkWindow | null;

/** iframe の文書に、印の色の CSS を置く（まだなければ） */
function ensureFrameStyle(doc: Document) {
  if (doc === document || doc.getElementById(FRAME_STYLE_ID)) return;
  const warn = getComputedStyle(document.documentElement).getPropertyValue("--warn").trim() || "#e5a50a";
  const style = doc.createElement("style");
  style.id = FRAME_STYLE_ID;
  style.textContent = `::highlight(${ALL}) { background-color: color-mix(in srgb, ${warn} 35%, transparent); }
::highlight(${CURRENT}) { color: #000; background-color: ${warn}; }`;
  (doc.head ?? doc.documentElement).append(style);
}

/** 文書ごとの印を付け外しする。付けた窓を覚えておき、clear でまとめて外す */
export function createFindMarks() {
  const touched = new Set<MarkWindow>();

  /** ranges を窓ごとに分けて name の印にする（ほかの窓の同じ印は外す） */
  const set = (name: string, ranges: Range[]) => {
    const byWindow = new Map<MarkWindow, Range[]>();
    for (const range of ranges) {
      const win = windowOf(range.startContainer);
      if (!win) continue;
      const list = byWindow.get(win) ?? [];
      list.push(range);
      byWindow.set(win, list);
    }
    for (const win of touched) if (!byWindow.has(win)) win.CSS?.highlights?.delete(name);
    for (const [win, list] of byWindow) {
      // Highlight はその窓のもので作る（iframe の CSS.highlights はほかの窓の Highlight を受け取らない）
      const HighlightOf = win.Highlight;
      if (!HighlightOf || !win.CSS?.highlights) continue;
      ensureFrameStyle(win.document);
      win.CSS.highlights.set(name, new HighlightOf(...list));
      touched.add(win);
    }
  };

  return {
    /** 合ったものすべての印 */
    all: (ranges: Range[]) => set(ALL, ranges),
    /** いまの位置の印（なければ外す） */
    current: (range: Range | undefined) => set(CURRENT, range ? [range] : []),
    /** すべての窓の印を外す */
    clear: () => {
      for (const win of touched) {
        win.CSS?.highlights?.delete(ALL);
        win.CSS?.highlights?.delete(CURRENT);
      }
      touched.clear();
    },
  };
}

/** target の中の iframe（読み込み直すと中の文書が入れ替わり、MutationObserver では気づけない） */
export const framesIn = (target: HTMLElement) => [...target.querySelectorAll("iframe")];
