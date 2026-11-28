// CodeMirror の飾り（置き換えて描く部品）の中に、React の部品を描く口。
// 部品は編集の部品（NoteEditor）の React の木から portal で描くので、アプリの文脈（リンクを開く口・テーマなど）がそのまま届く
import { Facet } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { createCell, useCell } from "@/foundation/ui/store";
import type { Cell } from "@/foundation/ui/store/cell";

/** 描く所（CodeMirror が作った要素）と、描く部品 */
interface PortalEntry {
  el: HTMLElement;
  node: ReactNode;
  /** React の key（要素ごとに変わらない。ほかの部品を外しても、描いた部品の状態を残す） */
  key: string;
}

export interface WidgetPortals {
  /** el に node を描く（同じ el なら描き直す） */
  mount(el: HTMLElement, node: ReactNode): void;
  /** el に描いた部品を外す（CodeMirror が要素を捨てたとき） */
  unmount(el: HTMLElement): void;
  /** 描く部品の一覧 */
  entries: Cell<readonly PortalEntry[]>;
}

export function createWidgetPortals(): WidgetPortals {
  const entries = createCell<readonly PortalEntry[]>([]);
  let nextKey = 1;
  return {
    mount(el, node) {
      entries.set((list) => {
        const i = list.findIndex((e) => e.el === el);
        return i < 0 ? [...list, { el, node, key: String(nextKey++) }] : list.map((e, j) => (j === i ? { ...e, node } : e));
      });
    },
    unmount(el) {
      entries.set((list) => (list.some((e) => e.el === el) ? list.filter((e) => e.el !== el) : list));
    },
    entries,
  };
}

/** 飾りが部品を描く口（NoteEditor が 1 つ渡す。ないときは描かない） */
export const widgetPortalsFacet = Facet.define<WidgetPortals, WidgetPortals | null>({ combine: (values) => values[0] ?? null });

/** 要素を描いた portals（飾りの destroy では view を受け取れないので、描いたときに覚える） */
const portalsByElement = new WeakMap<HTMLElement, WidgetPortals>();

/** 飾り（WidgetType の toDOM・updateDOM・小窓の create）の要素 el に、React の部品を描く（同じ el なら描き直す） */
export function mountInEditor(view: EditorView, el: HTMLElement, node: ReactNode): void {
  const portals = view.state.facet(widgetPortalsFacet);
  if (!portals) return;
  portalsByElement.set(el, portals);
  portals.mount(el, node);
}

/** 飾りの要素に描いた部品を外す（WidgetType の destroy・小窓の destroy） */
export function unmountFromEditor(el: HTMLElement): void {
  portalsByElement.get(el)?.unmount(el);
}

/** 飾りの中の部品を描く（編集の部品のすぐ隣に置く） */
export function WidgetPortalOutlet({ portals }: { portals: WidgetPortals }) {
  const entries = useCell(portals.entries);
  return <>{entries.map((e) => createPortal(e.node, e.el, e.key))}</>;
}
