import type { Element, ElementContent, Root } from "hast";
import { toJsxRuntime } from "hast-util-to-jsx-runtime";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import { WidgetType, type EditorView } from "@codemirror/view";
import { markdownToHast, pipelineOf } from "@/foundation/ui/markdown/markdownProcessor";
import { COMPONENTS } from "@/foundation/ui/markdown/markdownComponents";
import { mountInEditor, unmountFromEditor } from "./widgetPortals";

/** 段落 1 つだけの木なら、段落の中身（行の中に描くので段落の枠を外す） */
function inlineChildren(tree: Root): ElementContent[] {
  const only = tree.children.filter((c) => c.type !== "text" || c.value.trim() !== "");
  const p = only.length === 1 && only[0].type === "element" && only[0].tagName === "p" ? (only[0] as Element) : null;
  return p ? p.children : (tree.children as ElementContent[]);
}

/** 行の中の HTML を、返答の表示と同じ処理（中の HTML の一覧・リンク）で描く。読めなければ書いたまま */
export function InlineHtml({ source }: { source: string }) {
  const tree = markdownToHast(pipelineOf(undefined, null), source);
  if (!tree) return <>{source}</>;
  const element = toJsxRuntime({ type: "root", children: inlineChildren(tree) }, { Fragment, components: COMPONENTS, ignoreInvalidStyle: true, jsx, jsxs, passKeys: true, passNode: true });
  return <span className="markdown note-inline-html">{element}</span>;
}

/** 行の中の HTML の代わりに描く飾り（カーソルがその行に入ると元の文字） */
export class InlineHtmlWidget extends WidgetType {
  constructor(readonly source: string) {
    super();
  }
  eq(other: InlineHtmlWidget) {
    return other.source === this.source;
  }
  toDOM(view: EditorView) {
    const el = document.createElement("span");
    el.className = "cm-inline-html";
    mountInEditor(view, el, <InlineHtml source={this.source} />);
    return el;
  }
  destroy(el: HTMLElement) {
    unmountFromEditor(el);
  }
  ignoreEvent() {
    return false;
  }
}
