import { CompactPromptForm } from "./CompactPromptForm";

/**
 * 設定の「圧縮前・圧縮後指示」（projectId なし: すべてのプロジェクトで送る共通の指示）と、プロジェクトの設定の「圧縮前・圧縮後指示」（そのプロジェクトの指示）。
 * 利用者の依頼で、定型文（チャット欄の帯に並べる、自分で送る指示）とは項目を分けた（こちらは圧縮の前後に自動で送る指示）
 */
export function CompactPromptSettings({ projectId = null }: { projectId?: number | null }) {
  return (
    <>
      <CompactPromptForm kind="pre" projectId={projectId} />
      <CompactPromptForm kind="post" projectId={projectId} />
    </>
  );
}
