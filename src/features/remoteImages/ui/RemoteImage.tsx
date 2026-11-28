// Markdown の画像を描く部品（チャットとノートで同じ）。外の画像は許可したホストのものだけ、読み込んだ画像は押すと大きく見る
import "./ChatImage.css";
import { useEffect, useMemo, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import { Lock } from "lucide-react";
import { errorMessage } from "@shared/foundation/errors";
import type { RemoteImage as RemoteImageRef } from "@shared/remoteImages/remoteImages";
import { useAttachmentViewer } from "@/features/attachments/ui";
import { useQuery } from "@/foundation/ui/query";
import { useAllowedHosts } from "./imageHosts";
import { scopeKey, type ImageScope } from "./imageScope";
import { hostGroupOf, type ImageHostGroup } from "./imageGroups";
import { loadRemoteImage } from "./remoteImageCache";
import { imageErrorText } from "./imageError";
import { ImageHostButton, ImageUrlsButton } from "./ImageHostButton";

/** 外の画像: 許可したホストなら出し、まだなら同じホストの最初の 1 枚の位置にボタン（2 枚目からは何も出さない。チャットとノートで同じ） */
export function RemoteImage({ scope, remote, alt, sources }: { scope: ImageScope; remote: RemoteImageRef; alt?: string; sources: readonly string[] }) {
  const allowed = useAllowedHosts(scope).has(remote.host);
  const group = useMemo(() => hostGroupOf(sources, remote), [sources, remote]);
  const first = group.urls[0] === remote.url;
  if (!allowed) return first ? <ImageHostButton scope={scope} group={group} firstName={alt || nameOf(remote.url)} /> : null;
  return (
    <span className="chat-image">
      <LoadedImage load={() => loadRemoteImage(scope, remote.host, remote.url)} loadKey={`${scopeKey(scope)}:${remote.url}`} alt={alt} label={remote.url} />
      {first && <HostLine scope={scope} group={group} />}
    </span>
  );
}

/** 許可したホストの最初の画像の下: どのサイトの画像か・暗号化なし・URL を見る（その中で許可を外せる） */
function HostLine({ scope, group }: { scope: ImageScope; group: ImageHostGroup }) {
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
      <ImageUrlsButton scope={scope} group={group} allowed />
    </span>
  );
}

/** 読み込んで出す画像（押すと大きく見る。読めなければ理由と URL・パス） */
export function LoadedImage({ load, loadKey, alt, label, own = false }: { load: () => Promise<string>; loadKey: string; alt?: string; label: string; own?: boolean }) {
  // 何を読むかは loadKey で決める（load は描くたびに作られる）
  const image = useQuery(["ChatImage", loadKey], () => load());
  const url = image.data;
  const viewer = useAttachmentViewer(url ? [{ src: url, name: alt || nameOf(label) }] : []);
  // 覚えない画像（手元の画像）は、描かなくなったら・読み直したら捨てる
  useEffect(() => {
    if (!own || !url) return;
    return () => URL.revokeObjectURL(url);
  }, [own, url]);
  if (image.error) {
    return (
      <span className="chat-image-error">
        <span>{imageErrorText(errorMessage(image.error))}</span>
        <span className="chat-image-error-url">{label}</span>
      </span>
    );
  }
  if (!url) return <span className="chat-image-wait muted small">画像を読み込み中…</span>;
  return (
    <>
      <button type="button" className="chat-image-thumb" data-tip="大きく表示（右クリックでコピー・保存）" onClick={(e) => openViewer(e, () => viewer.open(0))} onContextMenu={(e) => viewer.menu(e, 0)}>
        <img className="chat-image-img" src={url} alt={alt ?? ""} />
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

/** 読み込まずに出す画像: data: の画像は画面の CSP が通すのでそのまま、ほか（読めない URL・ユーザー名入りなど）は文字だけ（チャットとノートで同じ） */
export function PlainImage({ src, alt }: { src: string; alt?: string }) {
  if (/^data:image\//i.test(src)) return <img className="chat-image-img" src={src} alt={alt ?? ""} loading="lazy" decoding="async" />;
  return <span className="chat-image-text">{alt || src}</span>;
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
