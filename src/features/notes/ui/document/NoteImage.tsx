import { Facet } from "@codemirror/state";
import { WidgetType, type EditorView } from "@codemirror/view";
import { webUrlOf } from "@shared/foundation/linkTarget";
import { widgetPortalsFacet, type WidgetPortals } from "./widgetPortals";

/** 画像の src を、画面で読める URL にする口（ノートのフォルダの中の画像だけ。ほかは null。開いたノートの画面が渡す） */
export const noteImageUrlFacet = Facet.define<(src: string) => string | null, ((src: string) => string | null) | null>({ combine: (values) => values[0] ?? null });

/**
 * ノートの画像（行の中に描く）。ノートのフォルダの中の画像はそのまま出す。外の画像は出さずに、説明とホストの札にする
 * （外の画像を読むと利用者が押す前に外へ通信してしまうため。返答の外の画像の取り方はチャットごとの許可に結び付いている）。読めない画像は説明の文
 */
function NoteImage({ src, alt, view }: { src: string; alt: string; view: EditorView }) {
  const url = view.state.facet(noteImageUrlFacet)?.(src) ?? null;
  if (url) return <img className="note-image" src={url} alt={alt} loading="lazy" decoding="async" onLoad={() => view.requestMeasure()} />;
  const remote = webUrlOf(src);
  return <span className="note-image-text">{remote ? `外の画像（${remote.host}）${alt ? `: ${alt}` : ""}` : alt || src}</span>;
}

const portalsByElement = new WeakMap<HTMLElement, WidgetPortals>();

/** 画像の書き方（![説明](パス)）の代わりに描く飾り（カーソルがその行に入ると元の文字） */
export class NoteImageWidget extends WidgetType {
  constructor(
    readonly src: string,
    readonly alt: string,
  ) {
    super();
  }
  eq(other: NoteImageWidget) {
    return other.src === this.src && other.alt === this.alt;
  }
  toDOM(view: EditorView) {
    const el = document.createElement("span");
    el.className = "cm-note-image";
    const portals = view.state.facet(widgetPortalsFacet);
    if (portals) {
      portalsByElement.set(el, portals);
      portals.mount(el, <NoteImage src={this.src} alt={this.alt} view={view} />);
    }
    return el;
  }
  destroy(el: HTMLElement) {
    portalsByElement.get(el)?.unmount(el);
  }
  ignoreEvent() {
    return false;
  }
}
