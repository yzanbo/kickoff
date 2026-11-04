import { useCallback, useRef, useState, type ComponentProps, type HTMLAttributes, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { cx } from "@/lib/cx";
import { anchorPlacement, type FloatingAlign, type FloatingSide } from "@/lib/floating";
import { useDismiss } from "@/hooks/useDismiss";
import { useFloating } from "@/hooks/useFloating";
import { PopoverHeader } from "./PopoverHeader";

interface PopoverProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  /** 開いた基準の要素（その下・上に出す）。押しても外側のクリックとして閉じず、基準の側で開閉する（開いているときに押したら閉じる） */
  anchor: RefObject<HTMLElement | null>;
  /** 出す側（既定は下。入らなければ反対側） */
  side?: FloatingSide;
  /** そろえる端（既定は左端） */
  align?: FloatingAlign;
  /** 基準の要素との間（px） */
  gap?: number;
  /** 見出しの題名（PopoverHeader。閉じるボタン付き）。省けば見出しを出さない */
  title?: ReactNode;
  /** 見出しの取り直しのボタン */
  refresh?: ComponentProps<typeof PopoverHeader>["refresh"];
  /** 読み上げの名前（aria-label） */
  label: string;
  /** Esc の扱い（useDismiss と同じ。既定は、重なったいちばん上だけ閉じる。none は中のキー操作で閉じるとき） */
  escape?: "stop" | "pass" | "none";
  /** 外側のクリックとして閉じない要素のセレクタ（中から開く確かめのダイアログなど） */
  ignore?: string;
  /** false の間は、外側のクリック・Esc で閉じない（中で画像を全画面で見ている間など） */
  dismissable?: boolean;
  /** body の直下に出す（開いた場所の文字の大きさ・折り返しなどを受け継がせないとき）。既定は開いた場所に置く */
  portal?: boolean;
  onClose: () => void;
  children: ReactNode;
}

/**
 * 押すと開く一覧・詳細（チャット欄の上のピル・下の帯の接続と使用状況・状態ごとのチャットなど）。
 * 基準の要素の下（上）に出し、描いてから大きさを測って画面の中に収める。開いている間は基準の要素を追い（送信待ちが増えてピルが動いた、など）、
 * 基準の要素が消えた・押せなくなった（パネルを閉じた・裏のスライドになった）ら閉じる。外側のクリック・Esc で閉じる。
 * top layer に出すので、中を切り取る枠（タブの列・送信待ちの一覧）やコンテナクエリの枠の中から開いても、切れずに画面を基準に置ける
 */
export function Popover({
  anchor,
  side = "below",
  align = "start",
  gap = 6,
  title,
  refresh,
  label,
  className,
  escape = "stop",
  ignore,
  dismissable = true,
  portal = false,
  onClose,
  children,
  ...rest
}: PopoverProps) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useDismiss([ref, anchor], onClose, { enabled: dismissable, escape, ignore });
  useFloating(
    ref,
    () => {
      const el = anchor.current;
      if (!el?.isConnected || el.closest("[inert]")) {
        close.current();
        return null;
      }
      return anchorPlacement(el, { side, align, gap });
    },
    { track: true },
  );
  const box = (
    <div ref={ref} popover="manual" role="dialog" aria-label={label} className={cx("popover", className)} {...rest}>
      {title !== undefined && <PopoverHeader title={title} refresh={refresh} onClose={onClose} />}
      {children}
    </div>
  );
  return portal ? createPortal(box, document.body) : box;
}

/**
 * Popover の開閉と基準の要素。anchor を開くボタン（か、それを包む要素）の ref に、open の間 Popover に anchor と close を渡す。
 * toggle は開くボタンの onClick（開いているときに押したら閉じる）
 */
export function usePopover<E extends HTMLElement = HTMLButtonElement>() {
  const [open, setOpen] = useState(false);
  const anchor = useRef<E>(null);
  const close = useCallback(() => setOpen(false), []);
  const toggle = useCallback(() => setOpen((o) => !o), []);
  return { open, setOpen, anchor, close, toggle };
}
