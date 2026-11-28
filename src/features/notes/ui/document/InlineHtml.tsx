import type { Element, ElementContent, Root } from "hast";
import { toJsxRuntime } from "hast-util-to-jsx-runtime";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import { markdownToHast, pipelineOf } from "@/foundation/ui/markdown/markdownProcessor";
import { COMPONENTS } from "@/foundation/ui/markdown/markdownComponents";
import { PortalWidget } from "./widgetPortals";

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
export class InlineHtmlWidget extends PortalWidget {
  constructor(readonly source: string) {
    super("span", "cm-inline-html");
  }
  eq(other: InlineHtmlWidget) {
    return other.source === this.source;
  }
  protected content() {
    return <InlineHtml source={this.source} />;
  }
  ignoreEvent() {
    return false;
  }
}
