// ページの ⌘F（開いているページの中を探す）の受け口。ページ（ファイル・変更・検索の右側、履歴の詳細、メモ、別ウィンドウなど）が
// 自分の要素と開き方を置き（usePageFind）、アプリ全体の ⌘F（app/shortcuts.ts）・別ウィンドウの ⌘F（PopoutApp）が runPageFind で開く。
// チャットの中の検索（ChatFind）・チャットの画面の右の欄の検索（AgentPanelFind）は、捕捉でこれより先に受け取る

interface Entry {
  el: HTMLElement;
  open: () => void;
}

/** 置いた順（後から置いたものほど後ろ） */
const entries: Entry[] = [];
/** 最後に押した要素（どこにもピントがないとき、押したページで開く） */
let lastPressed: Element | null = null;
let watching = false;

function watchPresses() {
  if (watching) return;
  watching = true;
  window.addEventListener("pointerdown", (e) => (lastPressed = e.target instanceof Element ? e.target : null), true);
}

/** ページの要素 el と、⌘F で開く処理を置く（戻り値で外す） */
export function registerPageFind(el: HTMLElement, open: () => void): () => void {
  watchPresses();
  const entry = { el, open };
  entries.push(entry);
  return () => {
    const i = entries.indexOf(entry);
    if (i >= 0) entries.splice(i, 1);
  };
}

/** 後ろから探して、最初に合うもの */
function findLast(list: Entry[], ok: (entry: Entry) => boolean): Entry | undefined {
  for (let i = list.length - 1; i >= 0; i--) if (ok(list[i])) return list[i];
  return undefined;
}

/**
 * 見えているページの ⌘F を開く。ピントのあるページ → 最後に押したページ → 最後に置いたページの順に選ぶ
 * （隠れているタブ・閉じたパネル・inert の中は選ばない）。開いたら true、見えているページがなければ false
 */
export function runPageFind(): boolean {
  const visible = entries.filter((e) => e.el.isConnected && e.el.checkVisibility() && !e.el.closest("[inert]"));
  const active = document.activeElement;
  const pick =
    findLast(visible, (e) => e.el.contains(active)) ?? findLast(visible, (e) => lastPressed !== null && e.el.contains(lastPressed)) ?? visible.at(-1);
  if (!pick) return false;
  pick.open();
  return true;
}
