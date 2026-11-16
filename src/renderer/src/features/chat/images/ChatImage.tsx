import { useEffect, useEffectEvent, useMemo, useState, type MouseEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Lock } from "lucide-react";
import { errorMessage } from "@shared/errors";
import { isLocalImagePath, remoteImageOf, type RemoteImage } from "@shared/links/remoteImages";
import { api } from "@/api";
import { MarkdownImagesContext, type MarkdownImageProps, type MarkdownImages } from "@/ui/markdown/markdownImages";
import { useAttachmentViewer } from "@/features/chat/attachments/useAttachmentViewer";
import { usePastWorkplaceAt } from "@/features/chat/timeline/PastWorkplace";
import { useAllowedHosts } from "./imageHosts";
import { hostGroupOf, type ImageHostGroup } from "./imageGroups";
import { loadRemoteImage } from "./remoteImageCache";
import { ImageHostButton, ImageUrlsButton } from "./ImageHostButton";

/**
 * チャットの画面の Markdown の画像の描き方を入れる（メモの仕様書「0027_チャット欄の外の画像とリンク」）: 手元の画像はコアから読んで出し、
 * 外の画像は「host から画像を n 件表示」を押して許可したホストのものだけを、コアが取ってきて出す（画面の CSP は開けない）
 */
export function ChatImagesProvider({ chatId, children }: { chatId: number; children: ReactNode }) {
  const value = useMemo<MarkdownImages>(() => ({ render: (props) => <ChatImage chatId={chatId} {...props} /> }), [chatId]);
  return <MarkdownImagesContext.Provider value={value}>{children}</MarkdownImagesContext.Provider>;
}

function ChatImage({ chatId, src, alt, sources }: MarkdownImageProps & { chatId: number }) {
  const remote = remoteImageOf(src);
  if (remote) return <RemoteChatImage chatId={chatId} remote={remote} alt={alt} sources={sources} />;
  if (isLocalImagePath(src)) return <LocalChatImage chatId={chatId} path={src} alt={alt} />;
  // data: の画像は画面の CSP が通すのでそのまま。ほか（読めない URL・ユーザー名入りなど）は文字だけ
  if (/^data:image\//i.test(src)) return <img className="chat-image-img" src={src} alt={alt ?? ""} loading="lazy" decoding="async" />;
  return <span className="chat-image-text">{alt || src}</span>;
}

/** 外の画像: 許可したホストなら出し、まだなら同じホストの最初の 1 枚の位置にボタン（2 枚目からは何も出さない） */
function RemoteChatImage({ chatId, remote, alt, sources }: { chatId: number; remote: RemoteImage; alt?: string; sources: readonly string[] }) {
  const allowed = useAllowedHosts(chatId).has(remote.host);
  const group = useMemo(() => hostGroupOf(sources, remote), [sources, remote]);
  const first = group.urls[0] === remote.url;
  if (!allowed) return first ? <ImageHostButton chatId={chatId} group={group} firstName={alt || nameOf(remote.url)} /> : null;
  return (
    <span className="chat-image">
      <LoadedImage load={() => loadRemoteImage(chatId, remote.host, remote.url)} loadKey={`${chatId}:${remote.url}`} alt={alt} label={remote.url} />
      {first && <HostLine chatId={chatId} group={group} />}
    </span>
  );
}

/** 許可したホストの最初の画像の下: どのサイトの画像か・暗号化なし・URL を見る（その中で許可を外せる） */
function HostLine({ chatId, group }: { chatId: number; group: ImageHostGroup }) {
  return (
    <span className="chat-image-host-line">
      <span className="chat-image-host">{group.host}</span>
      {group.insecure && (
        <span className="chat-image-insecure" data-tip="https でない（暗号化していない）画像を含みます">
          <Lock size={11} aria-hidden />
          暗号化なし
        </span>
      )}
      <span>画像 {group.urls.length} 件</span>
      <ImageUrlsButton chatId={chatId} group={group} allowed />
    </span>
  );
}

/** 手元の画像（作業場所・添付・メモのフォルダの中。相対パスはチャットの作業場所から） */
function LocalChatImage({ chatId, path, alt }: { chatId: number; path: string; alt?: string }) {
  // 作業場所を移した区切りより前の返答なら、相対パスはそのときの作業場所から（メモの仕様書「0025」の H5）
  const at = usePastWorkplaceAt();
  return (
    <span className="chat-image">
      <LoadedImage
        load={() => api.toolImage(chatId, path, at).then(({ blob }) => URL.createObjectURL(blob))}
        loadKey={`${chatId}:local:${at ?? ""}:${path}`}
        alt={alt}
        label={path}
        own
      />
    </span>
  );
}

/** 読み込んで出す画像（押すと大きく見る。読めなければ理由と URL・パス） */
function LoadedImage({ load, loadKey, alt, label, own = false }: { load: () => Promise<string>; loadKey: string; alt?: string; label: string; own?: boolean }) {
  const [state, setState] = useState<{ key: string; url?: string; error?: string }>({ key: loadKey });
  const viewer = useAttachmentViewer(state.url ? [{ src: state.url, name: alt || nameOf(label) }] : []);
  // 何を読むかは loadKey で決める（load は描くたびに作られる）
  const run = useEffectEvent(load);
  useEffect(() => {
    let alive = true;
    let made: string | undefined;
    run()
      .then((url) => {
        made = url;
        if (alive) setState({ key: loadKey, url });
      })
      .catch((e: unknown) => alive && setState({ key: loadKey, error: errorMessage(e) }));
    return () => {
      alive = false;
      // 覚えない画像（手元の画像）は、描かなくなったら捨てる
      if (own && made) URL.revokeObjectURL(made);
    };
  }, [loadKey, own]);
  const current = state.key === loadKey ? state : { key: loadKey };
  if (current.error) {
    return (
      <span className="chat-image-error">
        <span>画像を読み込めませんでした（{current.error}）</span>
        <span className="chat-image-error-url">{label}</span>
      </span>
    );
  }
  if (!current.url) return <span className="chat-image-wait muted small">画像を読み込み中…</span>;
  return (
    <>
      <button type="button" className="chat-image-thumb" data-tip="大きく表示（右クリックでコピー・保存）" onClick={(e) => openViewer(e, () => viewer.open(0))} onContextMenu={(e) => viewer.menu(e, 0)}>
        <img className="chat-image-img" src={current.url} alt={alt ?? ""} />
      </button>
      {/* 段落の中には置けない要素（ダイアログ・メニュー）なので body に出す。中の操作は、画像を包むリンクに届かせない */}
      {viewer.active &&
        createPortal(
          <span className="chat-image-detached" onClick={(e) => e.stopPropagation()}>
            {viewer.element}
          </span>,
          document.body,
        )}
    </>
  );
}

/** 画像を押したとき: リンクに包まれた画像はリンクの確認に任せ（押せばリンクを開く）、ほかは大きく見る */
function openViewer(e: MouseEvent<HTMLElement>, open: () => void) {
  if (e.currentTarget.closest("a[href]")) return;
  e.preventDefault();
  open();
}

/** URL・パスの終わりの名前 */
function nameOf(urlOrPath: string): string {
  const path = urlOrPath.split(/[?#]/)[0];
  const last = path.slice(path.lastIndexOf("/") + 1);
  try {
    return decodeURIComponent(last) || urlOrPath;
  } catch {
    return last || urlOrPath;
  }
}
