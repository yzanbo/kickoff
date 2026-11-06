import { PreCompactPromptForm } from "./PreCompactPromptForm";
import { SnippetBarField } from "./SnippetBarField";
import { SnippetManager } from "./SnippetManager";

/**
 * 設定の「定型文」（projectId なし: すべてのプロジェクトのもの）と、プロジェクトの設定の「定型文」（そのプロジェクトで使うもの）。
 * アプリの設定では、いちばん上に帯を表示するかの切り替え（SnippetBarField）。
 * チャット欄の帯の「定型文を管理」と同じ一覧（1 つの一覧で、範囲を共通 / プロジェクトから選ぶ）と、その下に圧縮前指示
 */
export function SnippetSettings({ projectId = null }: { projectId?: number | null }) {
  return (
    <>
      <section className="section">
        <h2>定型文</h2>
        <p className="muted small">
          {projectId === null
            ? "チャット欄の中の帯に並べる、よく送る指示です。共通のものはすべてのプロジェクトで、プロジェクトを選んだものはそのプロジェクトのチャットだけで使えます。"
            : "このプロジェクトのチャット欄の中の帯に並べる定型文です。共通のものはほかのプロジェクトでも使えます（ここで直すと、すべてのプロジェクトで変わります）。すべての定型文はアプリの設定の「定型文」で見られます。"}
        </p>
        {projectId === null && (
          <div className="form">
            <SnippetBarField />
          </div>
        )}
        <SnippetManager projectId={projectId} />
      </section>
      <PreCompactPromptForm projectId={projectId} />
    </>
  );
}
