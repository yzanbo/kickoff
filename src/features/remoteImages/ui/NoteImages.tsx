import type { ReactNode } from "react";
import { remoteImageOf } from "@shared/remoteImages/remoteImages";
import { MarkdownImagesContext, type MarkdownImageProps, type MarkdownImages } from "@/foundation/ui/markdown/markdownImages";
import { LoadedImage, RemoteImage } from "./ChatImage";

/**
 * 開いたノートの Markdown の画像の描き方を入れる（ノートの本文・表・HTML のまとまりの中で同じ）: ノートのフォルダの中の画像はそのまま出し
 * （localUrl。ノートの機能が読める URL にする）、外の画像はチャットと同じく、押して許可したホストのものだけをコアが取ってきて出す。許可はノートごと
 */
export function NoteImagesProvider({ projectId, path, localUrl, children }: { projectId: number; path: string; localUrl: (src: string) => string | null; children: ReactNode }) {
  const value: MarkdownImages = { render: (props) => <NoteImage projectId={projectId} path={path} localUrl={localUrl} {...props} /> };
  return <MarkdownImagesContext.Provider value={value}>{children}</MarkdownImagesContext.Provider>;
}

function NoteImage({ projectId, path, localUrl, src, alt, sources }: MarkdownImageProps & { projectId: number; path: string; localUrl: (src: string) => string | null }) {
  const remote = remoteImageOf(src);
  if (remote) return <RemoteImage scope={{ kind: "note", projectId, path }} remote={remote} alt={alt} sources={sources} />;
  const url = localUrl(src);
  if (url) {
    return (
      <span className="chat-image">
        <LoadedImage load={() => Promise.resolve(url)} loadKey={`note:${url}`} alt={alt} label={src} />
      </span>
    );
  }
  if (/^data:image\//i.test(src)) return <img className="chat-image-img" src={src} alt={alt ?? ""} loading="lazy" decoding="async" />;
  return <span className="chat-image-text">{alt || src}</span>;
}
