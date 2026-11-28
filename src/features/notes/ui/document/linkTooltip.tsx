// ノートのリンクの開き方: ふつうのクリックはカーソルを置き、カーソルがリンクの中にあって何も選んでいない間、
// リンクの下に小窓（行き先・開く・コピー）を出す。⌘ を押しながらのクリックはすぐ開く（⌘ を押している間はリンクの上で指の形）。
// 行き先ごとの開き方は開いたノートの画面（NoteView）が決める（noteLinkOpenerFacet）。# の行き先はこのノートの見出しへ移る
import { syntaxTree } from "@codemirror/language";
import { Facet, StateField, type EditorState } from "@codemirror/state";
import { EditorView, showTooltip, type Tooltip } from "@codemirror/view";
import type { JSX } from "react";
import { CopyButton } from "@/foundation/ui/kit/CopyButton";
import { editorFocus, editorFocusOf } from "./editorFocus";
import { footnoteAt, footnotes } from "./footnotes";
import { linkAt, type NoteLinkAt } from "./noteLinks";
import { headingPosition } from "./noteLinkTarget";
import { docText } from "./noteDoc";
import { mountInEditor, unmountFromEditor } from "./widgetPortals";

/** リンクの行き先の説明と開き方（開いたノートの画面が渡す） */
export interface NoteLinkOpener {
  /** 小窓に出す行き先（label）と、開けない理由（開けるなら null） */
  describe(href: string): { label: string; problem: string | null };
  /** 開く（invert: 設定と反対の開き先。⌘ を押しながら小窓の「開く」を押したとき） */
  open(href: string, text: string, invert: boolean): void;
}

export const noteLinkOpenerFacet = Facet.define<NoteLinkOpener, NoteLinkOpener | null>({ combine: (values) => values[0] ?? null });

/** このノートの見出しへ移る（なければ false） */
function jumpToHeading(view: EditorView, id: string): boolean {
  const target = headingPosition(syntaxTree(view.state), docText(view.state), id);
  if (target === null) return false;
  view.dispatch({ selection: { anchor: target }, effects: EditorView.scrollIntoView(target, { y: "start" }) });
  view.focus();
  return true;
}

/** リンクを開く（# はこのノートの見出し、ほかは開いたノートの画面に任せる） */
export function openNoteLink(view: EditorView, href: string, text: string, invert: boolean) {
  if (href.startsWith("#") && jumpToHeading(view, href.slice(1))) return;
  view.state.facet(noteLinkOpenerFacet)?.open(href, text, invert);
}

/** 小窓の中身（行き先・開く・コピー。開けないときは理由とコピーだけ） */
function LinkTooltip({ view, link, opener }: { view: EditorView; link: NoteLinkAt; opener: NoteLinkOpener }) {
  const { label, problem } = link.href.startsWith("#") ? { label: `見出し「${link.href.slice(1)}」へ`, problem: null } : opener.describe(link.href);
  return (
    <div className="note-link-tip">
      <span className="note-link-tip-target" data-problem={problem ? "" : undefined}>
        {problem ?? label}
      </span>
      {!problem && (
        <button type="button" className="note-link-tip-open" onMouseDown={(e) => e.preventDefault()} onClick={(e) => openNoteLink(view, link.href, link.text, e.metaKey)}>
          開く
        </button>
      )}
      <CopyButton text={link.href} label="リンクをコピー" size="xs" />
    </div>
  );
}

/** 脚注の小窓（注の文と「注へ移る」） */
function FootnoteTooltip({ view, number, text, defFrom }: { view: EditorView; number: number; text: string; defFrom: number }) {
  const jump = () => {
    view.dispatch({ selection: { anchor: defFrom }, effects: EditorView.scrollIntoView(defFrom, { y: "center" }) });
    view.focus();
  };
  return (
    <div className="note-link-tip">
      <span className="note-link-tip-target">
        注 {number}: {text}
      </span>
      <button type="button" className="note-link-tip-open" onMouseDown={(e) => e.preventDefault()} onClick={jump}>
        注へ移る
      </button>
    </div>
  );
}

/** 小窓を、portals で描く部品から作る */
function tooltipWith(pos: number, render: (view: EditorView) => JSX.Element | null): Tooltip {
  return {
    pos,
    above: false,
    arrow: false,
    create(view) {
      const dom = document.createElement("div");
      const node = render(view);
      if (node) mountInEditor(view, dom, node);
      return { dom, destroy: () => unmountFromEditor(dom) };
    },
  };
}

function tooltipOf(state: EditorState): Tooltip | null {
  const sel = state.selection.main;
  if (!sel.empty || !editorFocusOf(state).inside) return null;
  const tree = syntaxTree(state);
  const text = docText(state);
  const link = linkAt(tree, text, sel.head);
  if (!link) {
    const note = footnoteAt(footnotes(tree, text), sel.head);
    return note && tooltipWith(note.ref.from, (view) => <FootnoteTooltip view={view} number={note.ref.number} text={note.def.text} defFrom={note.def.from} />);
  }
  return tooltipWith(link.from, (view) => {
    const opener = view.state.facet(noteLinkOpenerFacet);
    return opener && <LinkTooltip view={view} link={link} opener={opener} />;
  });
}

const sameTip = (a: Tooltip | null, b: Tooltip | null) => a === b || (!!a && !!b && a.pos === b.pos);

const linkTooltipField = StateField.define<Tooltip | null>({
  create: tooltipOf,
  update(value, tr) {
    if (!tr.docChanged && !tr.selection && !tr.effects.length) return value;
    const next = tooltipOf(tr.state);
    // 同じリンクのまま（中で動いた・書いた）でも、行き先が変わりうるので作り直す。動かないときは同じ物
    return !tr.docChanged && sameTip(next, value) ? value : next;
  },
  provide: (field) => showTooltip.from(field),
});

/** ⌘ を押しながらのクリックですぐ開く。⌘ を押している間は、リンクの上で指の形にする */
const metaClick = EditorView.domEventHandlers({
  mousedown(e, view) {
    if (!e.metaKey || e.button !== 0) return false;
    const pos = view.posAtCoords({ x: e.clientX, y: e.clientY });
    const link = pos === null ? null : linkAt(syntaxTree(view.state), docText(view.state), pos);
    if (!link) return false;
    e.preventDefault();
    openNoteLink(view, link.href, link.text, false);
    return true;
  },
  mousemove(e, view) {
    view.dom.classList.toggle("note-meta-held", e.metaKey);
    return false;
  },
  keydown(e, view) {
    if (e.key === "Meta") view.dom.classList.add("note-meta-held");
    return false;
  },
  keyup(e, view) {
    if (e.key === "Meta") view.dom.classList.remove("note-meta-held");
    return false;
  },
});

/** リンクの小窓と ⌘ ＋クリック（Markdown 表示のときだけ入れる） */
export const linkTooltip = [editorFocus, linkTooltipField, metaClick];
