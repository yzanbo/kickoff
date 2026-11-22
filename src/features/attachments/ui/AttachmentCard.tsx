// 添付の札の骨組み（ファイル・ノート・「AI に渡す」で取ったものの 3 種類で同じ形: 左に角丸のアイコンの地かサムネイル、右に名前と 2 行目。styles/chat/attachments.css）
import type { MouseEvent, ReactNode } from "react";
import { cx } from "@/foundation/ui/lib/cx";

/** 札を押したとき（button = アプリの中で開く・download = ダウンロード。省けば押せない） */
export type CardOpen =
  | { kind: "button"; label: string; onClick: () => void; onContextMenu?: (e: MouseEvent) => void; tip?: string; className?: string }
  | { kind: "download"; href: string; download: string };

export interface CardProps {
  /** 種類のクラス（file-attachment など） */
  className: string;
  /** 乗せたときの説明 */
  title: string;
  /** サムネイルの画像（なければ icon を角丸の地に置く）。lazy は画面に入ってから読む */
  thumb?: { src: string; lazy?: boolean };
  icon?: ReactNode;
  name: ReactNode;
  sub: string;
  open?: CardOpen;
  onRemove?: () => void;
  removeLabel: string;
  /** 札の後ろに置くもの（大きく見る画面・中身を見るダイアログ） */
  children?: ReactNode;
}

export function AttachmentCard({ className, title, thumb, icon, name, sub, open, onRemove, removeLabel, children }: CardProps) {
  const body = (
    <>
      {thumb ? (
        <img className="attachment-thumb" src={thumb.src} alt="" loading={thumb.lazy ? "lazy" : undefined} />
      ) : (
        <span className="attachment-icon">{icon}</span>
      )}
      <span className="attachment-meta">
        <span className="attachment-name">{name}</span>
        <span className="attachment-sub">{sub}</span>
      </span>
    </>
  );
  return (
    <span className={cx("attachment", className)} title={title}>
      {open?.kind === "button" ? (
        <button type="button" className={cx("attachment-link", open.className)} title={open.tip} aria-label={open.label} onClick={open.onClick} onContextMenu={open.onContextMenu}>
          {body}
        </button>
      ) : open?.kind === "download" ? (
        <a className="attachment-link" href={open.href} download={open.download}>
          {body}
        </a>
      ) : (
        <span className="attachment-link">{body}</span>
      )}
      {onRemove && (
        <button type="button" className="chip-remove" aria-label={removeLabel} onClick={onRemove}>
          ×
        </button>
      )}
      {children}
    </span>
  );
}
