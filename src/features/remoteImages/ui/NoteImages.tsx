import { useMemo, type ReactNode } from "react";
import { remoteImageOf } from "@shared/remoteImages/remoteImages";
import { MarkdownImagesContext, type MarkdownImageProps, type MarkdownImages } from "@/foundation/ui/markdown/markdownImages";
import { LoadedImage, PlainImage, RemoteImage } from "./RemoteImage";

/**
 * 開いたノートの Markdown の画像の描き方を入れる（ノートの本文・表・HTML のまとまりの中で同じ）: ノートのフォルダの中の画像はそのまま出し
 * （localUrl。ノートの機能が読める URL にする）、外の画像はチャットと同じく、押して許可したホストのものだけをコアが取ってきて出す。許可はノートごと。
 * 値は変わったときだけ作り直す（毎回作ると、ノートを描き直すたびに中の画像の部品がすべて描き直る）
 */
export function NoteImagesProvider({ projectId, path, localUrl, children }: { projectId: number; path: string; localUrl: (src: string) => string | null; children: ReactNode }) {
  const value = useMemo<MarkdownImages>(() => ({ render: (props) => <NoteImage projectId={projectId} path={path} localUrl={localUrl} {...props} /> }), [projectId, path, localUrl]);
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
  return <PlainImage src={src} alt={alt} />;
}
