import { useMemo, type ReactNode } from "react";
import { isLocalImagePath, remoteImageOf } from "@shared/remoteImages/remoteImages";
import { MarkdownImagesContext, type MarkdownImageProps, type MarkdownImages } from "@/foundation/ui/markdown/markdownImages";
import { uploadsApi } from "@/features/attachments/ui";
import { usePastWorkplaceAt } from "@/features/chat/ui";
import { LoadedImage, PlainImage, RemoteImage } from "./RemoteImage";

/**
 * チャットの画面の Markdown の画像の描き方を入れる: 手元の画像はコアから読んで出し、
 * 外の画像は「host から画像を n 件表示」を押して許可したホストのものだけを、コアが取ってきて出す（画面の CSP は開けない）。
 * 守りの本体は「利用者が押すまで外へ通信しない」ことなので、許可の前に外の URL を読む形（img の src に入れるなど）にしない
 */
export function ChatImagesProvider({ chatId, children }: { chatId: number; children: ReactNode }) {
  const value = useMemo<MarkdownImages>(() => ({ render: (props) => <ChatImage chatId={chatId} {...props} /> }), [chatId]);
  return <MarkdownImagesContext.Provider value={value}>{children}</MarkdownImagesContext.Provider>;
}

function ChatImage({ chatId, src, alt, sources }: MarkdownImageProps & { chatId: number }) {
  const remote = remoteImageOf(src);
  if (remote) return <RemoteImage scope={{ kind: "chat", chatId }} remote={remote} alt={alt} sources={sources} />;
  if (isLocalImagePath(src)) return <LocalChatImage chatId={chatId} path={src} alt={alt} />;
  return <PlainImage src={src} alt={alt} />;
}

/** 手元の画像（作業場所・添付・ノートのフォルダの中。相対パスはチャットの作業場所から） */
function LocalChatImage({ chatId, path, alt }: { chatId: number; path: string; alt?: string }) {
  // 作業場所を移した区切りより前の返答なら、相対パスはそのときの作業場所から
  const at = usePastWorkplaceAt();
  return (
    <span className="chat-image">
      <LoadedImage
        load={() => uploadsApi.toolImage(chatId, path, at).then(({ blob }) => URL.createObjectURL(blob))}
        loadKey={`${chatId}:local:${at ?? ""}:${path}`}
        alt={alt}
        label={path}
        own
      />
    </span>
  );
}
