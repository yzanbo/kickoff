import { SnippetBarField } from "./SnippetBarField";
import { SnippetManager } from "./SnippetManager";
import { useIsCommonProject } from "@/features/projects/ui";

/**
 * 設定の「定型文」（projectId なし: すべての定型文）と、プロジェクト・共通の設定の「定型文」（そこで使うもの）。
 * アプリの設定では、いちばん上に帯を表示するかの切り替え（SnippetBarField）。
 * チャット欄の帯の「定型文を管理」と同じ一覧（1 つの一覧で、範囲を すべてのプロジェクト / 共通 / プロジェクトから選ぶ）。圧縮前指示・圧縮後指示は別の項目（CompactPromptSettings）
 */
export function SnippetSettings({ projectId = null }: { projectId?: number | null }) {
  const common = useIsCommonProject(projectId ?? 0);
  return (
    <section className="section">
      <h2>定型文</h2>
      <p className="muted small">
        {projectId === null
          ? "チャット欄の中の帯に並べる、よく送る指示です。範囲を「すべてのプロジェクト」にしたものはどのプロジェクトと共通のチャットで、「共通」にしたものは共通のチャットだけで、プロジェクトを選んだものはそのプロジェクトのチャットだけで使えます。"
          : `${common ? "共通のチャット" : "このプロジェクトのチャット"}欄の中の帯に並べる定型文です。「すべてのプロジェクト」のものは${common ? "プロジェクトのチャット" : "ほかのプロジェクトや共通のチャット"}でも使えます（ここで直すと、どこでも変わります）。すべての定型文はアプリの設定の「定型文」で見られます。`}
      </p>
      {projectId === null && (
        <div className="form">
          <SnippetBarField />
        </div>
      )}
      <SnippetManager projectId={projectId} />
    </section>
  );
}
