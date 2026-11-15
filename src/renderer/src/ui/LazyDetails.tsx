import { useState, type DetailsHTMLAttributes, type MouseEvent, type ReactElement, type ReactNode, type ToggleEvent } from "react";

/**
 * 開くまで中身を作らない <details>。中身は関数で受け、初めて開くときに作る（閉じている間に作ると、使わない行の組み立て・
 * 色付けの準備の重さがかかる）。一度開いたら、閉じても中身を残す（色付け・中のスクロールの位置・読み込んだ画像を捨てない）。
 * summary は <summary> の要素をそのまま渡す（中のボタン・矢印の形は呼ぶ側が決める）。開閉は <details> のまま（部品の中）。
 * 見出しを押したときは、開く前（押した知らせの中）に中身を作る（toggle の知らせを待つと、開いた直後の 1 コマが空になる）
 */
export function LazyDetails({
  summary,
  children,
  onClick,
  onToggle,
  ...rest
}: {
  summary: ReactElement;
  children: () => ReactNode;
} & Omit<DetailsHTMLAttributes<HTMLDetailsElement>, "children" | "open">) {
  const [ever, setEver] = useState(false);
  return (
    <details
      {...rest}
      onClick={(e: MouseEvent<HTMLDetailsElement>) => {
        onClick?.(e);
        // 自分の見出しを押した（中のボタンが開閉を止めたときは除く）
        if (!ever && !e.defaultPrevented && (e.target as Element).closest("summary")?.parentElement === e.currentTarget) setEver(true);
      }}
      onToggle={(e: ToggleEvent<HTMLDetailsElement>) => {
        // 見出しを押す以外で開いたとき（ページの中の検索で開いたなど）
        if (e.currentTarget.open) setEver(true);
        onToggle?.(e);
      }}
    >
      {summary}
      {ever && children()}
    </details>
  );
}
