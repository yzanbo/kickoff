import { TriangleAlert } from "lucide-react";

/**
 * 同じ作業場所で、ほかのチャットも作業中だという知らせ（同じファイルを触るとぶつかる。チャット欄のすぐ上の 1 行。注意の色と ⚠）。
 * チャットの画面と新しいチャットの画面で同じものを出す。count が 0 なら何も出さない
 */
export function BusyNeighborsNotice({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <p className="composer-notice small warn-text">
      <TriangleAlert size={13} aria-hidden />
      <span>この作業場所では、ほかのチャット {count} 件も作業中です。同じファイルを触ると作業がぶつかることがあります。</span>
    </p>
  );
}
