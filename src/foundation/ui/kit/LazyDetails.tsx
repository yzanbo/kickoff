import { useState, type DetailsHTMLAttributes, type MouseEvent, type ReactElement, type ReactNode, type ToggleEvent } from "react";

/**
 * 開くまで中身を作らない <details>。中身は関数で受け、初めて開くときに作る（閉じている間に作ると、使わない行の組み立て・
 * 色付けの準備の重さがかかる）。一度開いたら、閉じても中身を残す（色付け・中のスクロールの位置・読み込んだ画像を捨てない）。
 * summary は <summary> の要素をそのまま渡す（中のボタン・矢印の形は呼ぶ側が決める）。
 * 開閉は呼ぶ側の値（open / onOpenChange）で決める（流れの見え方の店に置き、行が窓から外れて戻っても・画面を作り直しても開いたまま）。
 * 渡さなければ <details> のまま（部品の中）。見出しを押したときは、押した知らせの中で開き、同じ描画で中身を作る
 * （toggle の知らせを待つと、開いた直後の 1 コマが空になる）。中のボタンが開閉を止めたとき（preventDefault）は開かない
 */
export function LazyDetails({
  summary,
  children,
  open,
  onOpenChange,
  onClick,
  onToggle,
  ...rest
}: {
  summary: ReactElement;
  children: () => ReactNode;
  /** 開いているか（渡せば開閉は呼ぶ側が持つ） */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
} & Omit<DetailsHTMLAttributes<HTMLDetailsElement>, "children" | "open">) {
  const controlled = open !== undefined && onOpenChange !== undefined;
  const [ever, setEver] = useState(open === true);
  if (open && !ever) setEver(true);
  return (
    <details
      {...rest}
      open={controlled ? open : undefined}
      onClick={(e: MouseEvent<HTMLDetailsElement>) => {
        onClick?.(e);
        // 自分の見出しを押した（中のボタンが開閉を止めたときは除く）
        if (e.defaultPrevented || (e.target as Element).closest("summary")?.parentElement !== e.currentTarget) return;
        if (controlled) {
          // 開閉は値で決める（<details> に任せると、値と食い違う）
          e.preventDefault();
          onOpenChange(!open);
        } else if (!ever) setEver(true);
      }}
      onToggle={(e: ToggleEvent<HTMLDetailsElement>) => {
        // 見出しを押す以外で開閉したとき（ページの中の検索で開いたなど）
        const now = e.currentTarget.open;
        if (now) setEver(true);
        if (controlled && now !== open) onOpenChange(now);
        onToggle?.(e);
      }}
    >
      {summary}
      {ever && children()}
    </details>
  );
}
