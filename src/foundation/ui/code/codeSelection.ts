// 編集の部品（Monaco）で選んだ行を、右の欄・別ウィンドウの「チャットに追加」（SelectionAttach の pickedInCode）と右クリック（useCodeQuoteMenu）から読む口。
// Monaco の選択はページの選択（window.getSelection）にならないので、編集の部品が自分の入れ物（`[data-quote-path]` の要素）に読み方を置く

/** 編集の部品で選んでいる所 */
export interface CodeSelection {
  /** 選んだ行（1 から。to を含む） */
  from: number;
  to: number;
  /** 選んだ文そのもの（コピーに使う） */
  text: string;
  /** 選んだ行の全体（行番号付きで引用するとき） */
  code: string;
  /** 画面の位置（ボタンを上に出す） */
  rect: { left: number; top: number; width: number };
}

const sources = new WeakMap<Element, () => CodeSelection | null>();

/** 入れ物 el に、選んでいる所の読み方を置く（戻り値で外す） */
export function registerCodeSelection(el: Element, read: () => CodeSelection | null): () => void {
  sources.set(el, read);
  return () => {
    if (sources.get(el) === read) sources.delete(el);
  };
}

/** 入れ物 el の編集の部品で選んでいる所（編集の部品でない・選んでいなければ null） */
export function codeSelectionOf(el: Element): CodeSelection | null {
  return sources.get(el)?.() ?? null;
}

/** ピントのある編集の部品が root の中にあれば、その入れ物と選んでいる所（なければ undefined） */
export function focusedCodeSelection(root: Element): { section: HTMLElement; selection: CodeSelection } | undefined {
  const section = document.activeElement?.closest<HTMLElement>("[data-quote-path]");
  if (!section || !root.contains(section)) return undefined;
  const selection = codeSelectionOf(section);
  return selection ? { section, selection } : undefined;
}
