import { useContext } from "react";
import { MarkdownImagesContext } from "@/foundation/ui/markdown/markdownImages";
import { sameSources } from "./noteLinks";
import { PortalWidget } from "./widgetPortals";

/**
 * ノートの画像（行の中に描く）。描き方は開いたノートの画面が入れる（remoteImages の NoteImagesProvider。ノートのフォルダの中の画像はそのまま、
 * 外の画像は押して許可したホストのものだけ。表・HTML のまとまりの中の画像と同じ）。入っていなければ説明の文。
 * sources はノートの中の画像の行き先（返答と同じく、許可のボタンは同じホストの最初の 1 枚の位置に出し、件数はノート全体）
 */
function NoteImage({ src, alt, sources }: { src: string; alt: string; sources: readonly string[] }) {
  const images = useContext(MarkdownImagesContext);
  return images ? <>{images.render({ src, alt, sources })}</> : <span className="note-image-text">{alt || src}</span>;
}

/** 画像の書き方（![説明](パス)）の代わりに描く飾り（カーソルがその行に入ると元の文字） */
export class NoteImageWidget extends PortalWidget {
  constructor(
    readonly src: string,
    readonly alt: string,
    readonly sources: readonly string[],
  ) {
    super("span", "cm-note-image");
  }
  eq(other: NoteImageWidget) {
    return other.src === this.src && other.alt === this.alt && sameSources(other.sources, this.sources);
  }
  protected content() {
    return <NoteImage src={this.src} alt={this.alt} sources={this.sources} />;
  }
  // 画像のボタン（表示・URL を見る）と画像を押せるように、中の押下は本体が扱わない
  ignoreEvent(e: Event) {
    return !!(e.target as HTMLElement).closest("button");
  }
}
