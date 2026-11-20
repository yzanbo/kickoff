import type { ReactNode } from "react";

/**
 * 見出しの下の帯: 開いたあとでほかで変わった文書に、読み直すか上書きするかを選んでもらう（useDocument の status が conflict のとき出す）。
 * 聞くダイアログは出さない（帯のまま書き続けられる）
 */
export function DocumentConflictBar({
  children = "開いたあとで、ほかで変わりました。",
  onReload,
  onOverwrite,
}: {
  /** 何が変えたかの説明（ノートは「チャットからの追記・ほかのアプリなど」） */
  children?: ReactNode;
  onReload(): void;
  onOverwrite(): void;
}) {
  return (
    <div className="file-changed-notice" role="status">
      {children}
      <button className="btn btn-sm" onClick={onReload}>
        読み直す（書いたものは捨てる）
      </button>
      <button className="btn btn-sm" onClick={onOverwrite}>
        書いたもので上書き
      </button>
    </div>
  );
}
