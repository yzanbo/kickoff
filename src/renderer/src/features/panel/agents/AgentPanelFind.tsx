import { openSearchPanel } from "@codemirror/search";
import { EditorView } from "@codemirror/view";
import { ChevronDown, ChevronUp, Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { isCancelKey, isComposing, isKey } from "@/lib/keys";
import { useWindowEvent } from "@/hooks/useWindowEvent";
import { CloseButton, IconButton } from "@/ui/IconButton";
import { lastPressedElement } from "@/features/chat/pane/chatHotkeys";
import { findInTexts, stepMatch } from "./paneFind";

/** 印の名前（CSS の ::highlight(pane-find) / ::highlight(pane-find-current)） */
const ALL = "pane-find";
const CURRENT = "pane-find-current";

/** 探すときに入らない要素（入力欄・見えないもの） */
const SKIP = "input, textarea, script, style, [hidden], .pane-find";

/** 要素の中の、見えている文字のノード */
function textNodes(root: HTMLElement): Text[] {
  const nodes: Text[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      const parent = node.parentElement;
      if (!parent || !node.nodeValue?.trim() || parent.closest(SKIP) || !parent.checkVisibility()) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n as Text);
  return nodes;
}

const clearMarks = () => {
  CSS.highlights?.delete(ALL);
  CSS.highlights?.delete(CURRENT);
};

/**
 * チャットの画面の右の欄の ⌘F（タブの中の文字を探す）。ピントが右の欄の中にある（どこにもピントがなければ、最後に右の欄を押した）とき、
 * 表示しているタブで探す: メモ（CodeMirror）はエディタの検索の欄（見えていない行も探せる）、ファイルの編集（Monaco）は Monaco の検索、
 * 子チャットはその画面のチャットの検索に任せ、ほか（サブエージェント・変更・ファイル）は欄の右上に検索の欄を出して、画面の文字に印を付ける
 * （CSS Custom Highlight API。DOM は書き換えない）。Enter / ↓ で次、Shift+Enter / ↑ で前、Esc で閉じる
 */
export function AgentPanelFind({ chatId }: { chatId: number }) {
  // この欄（同じチャットを 2 つの欄で開いていれば、ピントのある・最後に押した方）
  const [panel, setPanel] = useState<HTMLElement | null>(null);
  // 探しているタブの中身（開いていなければ null）
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [query, setQuery] = useState("");
  const [count, setCount] = useState(0);
  const [index, setIndex] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // 印の位置（探し直したら作り直す）
  const ranges = useRef<Range[]>([]);

  useWindowEvent(
    "keydown",
    (e) => {
      if (!(isKey(e, "f", { meta: true }) || isKey(e, "f", { ctrl: true }))) return;
      const active = document.activeElement;
      const idle = !active || active === document.body;
      const panel = [...document.querySelectorAll<HTMLElement>(`[data-panel-key="agents:${chatId}"]`)].find(
        (p) => p.offsetParent && (p.contains(active) || (idle && p.contains(lastPressedElement()))),
      );
      if (!panel) return;
      const focusedHere = panel.contains(active);
      // エディタ（メモの CodeMirror・ファイルの Monaco）の中なら、その検索に任せる
      if (active?.closest(".cm-editor, .monaco-editor")) return;
      const from = (focusedHere ? active : lastPressedElement())?.closest<HTMLElement>(".panel-tab-page");
      const page = from && !from.hidden ? from : panel.querySelector<HTMLElement>(".panel-tab-page:not([hidden])");
      if (!page) return;
      // 子チャットは、その画面のチャットの検索に任せる
      if (page.querySelector(".chat-find")) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      // メモはエディタの検索の欄を開く
      const editor = page.querySelector<HTMLElement>(".cm-editor");
      const view = editor && EditorView.findFromDOM(editor);
      if (view) {
        view.focus();
        openSearchPanel(view);
        return;
      }
      setPanel(panel);
      setTarget(page);
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    },
    true,
    true,
  );

  /** 探し直す（文字・タブの中身が変わったとき）。keep なら、いまの位置に近いものを選び直す */
  const research = (text: string) => {
    if (!target) return 0;
    const nodes = textNodes(target);
    const matches = findInTexts(
      nodes.map((n) => n.nodeValue ?? ""),
      text,
    );
    ranges.current = matches.map((m) => {
      const range = document.createRange();
      range.setStart(nodes[m.node], m.start);
      range.setEnd(nodes[m.node], m.end);
      return range;
    });
    if (typeof Highlight !== "undefined" && CSS.highlights) {
      if (ranges.current.length > 0) CSS.highlights.set(ALL, new Highlight(...ranges.current));
      else clearMarks();
    }
    setCount(ranges.current.length);
    return ranges.current.length;
  };

  /** その位置へ移って、いまの印を付ける */
  const show = (i: number | null) => {
    setIndex(i);
    CSS.highlights?.delete(CURRENT);
    const range = i === null ? undefined : ranges.current[i];
    if (!range) return;
    if (typeof Highlight !== "undefined") CSS.highlights?.set(CURRENT, new Highlight(range));
    range.startContainer.parentElement?.scrollIntoView({ block: "center", inline: "nearest" });
  };

  // 文字を変えたら探し直して、最初の一致へ
  useEffect(() => {
    if (!target) return;
    const n = research(query);
    show(n > 0 ? 0 : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, target]);

  // 閉じたら・消えたら印を外す
  useEffect(() => (target ? clearMarks : undefined), [target]);

  const close = () => {
    setTarget(null);
    setIndex(null);
    clearMarks();
  };
  const go = (step: 1 | -1) => {
    // 中身が変わっていることがある（実行中のサブエージェント）ので、探し直してから移る
    const n = research(query);
    show(stepMatch(index !== null && index < n ? index : null, n, step));
  };

  if (!target || !panel || !panel.isConnected) return null;
  return createPortal(
    <div className="pane-find" role="search">
      <Search size={13} className="muted" aria-hidden />
      <input
        ref={inputRef}
        type="text"
        value={query}
        placeholder="このタブを検索"
        aria-label="このタブの中を検索"
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (isComposing(e)) return;
          if (isCancelKey(e)) {
            // 右の欄を閉じる Esc に渡さない
            e.stopPropagation();
            e.nativeEvent.stopImmediatePropagation();
            close();
          } else if (e.key === "Enter" || e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            go(e.key === "ArrowUp" || (e.key === "Enter" && e.shiftKey) ? -1 : 1);
          }
        }}
      />
      <span className="pane-find-count">{query ? (count === 0 ? "0 件" : `${(index ?? 0) + 1}/${count}`) : ""}</span>
      <IconButton type="button" icon={ChevronUp} size={13} label="前へ" keys="⇧Enter" disabled={count === 0} onClick={() => go(-1)} />
      <IconButton type="button" icon={ChevronDown} size={13} label="次へ" keys="Enter" disabled={count === 0} onClick={() => go(1)} />
      <CloseButton type="button" size={13} label="検索を閉じる" keys="Esc" onClick={close} />
    </div>,
    panel,
  );
}
