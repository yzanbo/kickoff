import { Children, createContext, isValidElement, useContext, useState } from "react";
import type { Components } from "react-markdown";
import { imageSourcesOf, MarkdownImageSourcesContext } from "./markdownImages";

/** たたむ部分を開け閉めする（summary を押したとき。details の中だけにある） */
const DetailsToggle = createContext<(() => void) | null>(null);

/**
 * Markdown の中の HTML のたたむ部分（details）。開け閉めは React の state で持ち、閉じている間は中身を画面（DOM）に置かない
 * （選んでコピー・引用・ページの中の検索・画像の読み込みに、見えていない中身が入らないように。ブラウザに任せると、閉じていても中身は DOM にある）。
 * 見出し（summary）は読み取りが必ず最初に置く（なければ「詳細」。html/htmlVerify.ts）。
 * 中の画像は、開いたときにこの部分の分として数えて配る（「host から画像を n 件表示」のボタンを、この中の最初の画像に出す。外の数には入らない）
 */
export const details: Components["details"] = function MarkdownDetails({ node, open, children, ...props }) {
  const [isOpen, setOpen] = useState(Boolean(open));
  const items = Children.toArray(children);
  const head = items.find((c) => isValidElement(c) && c.type === summary);
  return (
    // ブラウザが自分で開け閉めしたとき（ページの中の検索など）も state に合わせる
    <details {...props} open={isOpen} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <DetailsToggle.Provider value={() => setOpen(!isOpen)}>
        {head}
        {isOpen && <MarkdownImageSourcesContext.Provider value={node ? imageSourcesOf(node) : []}>{items.filter((c) => c !== head)}</MarkdownImageSourcesContext.Provider>}
      </DetailsToggle.Provider>
    </details>
  );
};

/** たたむ部分の見出し。押したらブラウザの既定の開け閉めを止めて、state で開け閉めする（中のリンクを押したときは開け閉めしない） */
export const summary: Components["summary"] = function MarkdownSummary({ node: _node, children, ...props }) {
  const toggle = useContext(DetailsToggle);
  return (
    <summary
      {...props}
      onClick={(e) => {
        if (!toggle || e.defaultPrevented) return;
        e.preventDefault();
        toggle();
      }}
    >
      {children}
    </summary>
  );
};
