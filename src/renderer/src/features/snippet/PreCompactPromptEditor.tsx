import { useState } from "react";
import { PRE_COMPACT_PROMPT_MAX } from "@shared/chat/prompts";
import { useFold } from "@/hooks/useFold";
import { useProjects } from "@/stores/projects";
import { Chevron } from "@/ui/Chevron";
import { ResultMessage } from "@/ui/SaveActions";
import { Segmented } from "@/ui/Segmented";
import { usePreCompactPrompt } from "./usePreCompactPrompt";

type Scope = "common" | "project";

/** 開閉の行に添える、いま送る指示の範囲（プロジェクトの分はプロジェクト名で） */
function summaryOf(common: boolean, project: boolean, projectName: string): string {
  if (common && project) return `共通 ＋ ${projectName}`;
  if (common) return "共通";
  if (project) return projectName;
  return "なし";
}

/**
 * チャット欄のメーターの詳細の「圧縮前指示」: 会話を圧縮する前に AI に送る指示を、その場で書いて保存する（設定の「定型文」の欄と同じ値）。
 * 開閉の行（初めは閉じる。開いているかは覚える）に、いま送る指示の範囲を添える。開くと、共通 / プロジェクト（名前で出す）を切り替えて書く
 * （両方の書きかけを持ち、切り替えても消さない。送るときは共通 → プロジェクトの順につなぐ）
 */
export function PreCompactPromptEditor({ projectId }: { projectId: number }) {
  const fold = useFold("composer", "pre-compact", { defaultOpen: false });
  const common = usePreCompactPrompt(null);
  const project = usePreCompactPrompt(projectId);
  const projectName = useProjects().projectsById.get(projectId)?.name ?? "このプロジェクト";
  // 初めは、指示のあるほう（どちらにもなければ共通）
  const [scope, setScope] = useState<Scope>(() => (project.saved !== null && common.saved === null ? "project" : "common"));
  const current = scope === "common" ? common : project;

  return (
    <div className="context-pre-compact">
      <button type="button" className="context-pre-compact-toggle" aria-expanded={fold.open} onClick={fold.toggle}>
        <span className="context-pre-compact-label">圧縮前指示</span>
        <span className="context-pre-compact-summary">{summaryOf(common.saved !== null, project.saved !== null, projectName)}</span>
        <Chevron open={fold.open} />
      </button>
      {fold.open && (
        <div className="context-pre-compact-body">
          <Segmented
            className="segmented context-pre-compact-scope"
            label="圧縮前指示の範囲"
            value={scope}
            onChange={setScope}
            options={[
              { value: "common", label: "共通", tip: "すべてのプロジェクトで送る指示（設定の「定型文」と同じ）" },
              { value: "project", label: projectName, tip: `「${projectName}」だけで、共通の指示のあとにつなげて送る指示` },
            ]}
          />
          <textarea
            rows={3}
            value={current.draft}
            maxLength={PRE_COMPACT_PROMPT_MAX}
            aria-label={scope === "common" ? "すべてのプロジェクトの圧縮前指示" : `「${projectName}」の圧縮前指示`}
            placeholder="例: いまの作業の進捗・決めたこと・次にやることを memo.md に書き残してください"
            onChange={(e) => current.setDraft(e.target.value)}
          />
          <p className="context-sub">圧縮の前（手で圧縮・自動の圧縮）に送ります。空にすると送りません。</p>
          <div className="context-pre-compact-actions">
            <button type="button" className="btn btn-sm btn-primary" disabled={!current.dirty || current.save.saving} onClick={() => void current.save.run(current.submit)}>
              {current.save.saving ? "保存中…" : "保存"}
            </button>
            <ResultMessage result={current.save.message} />
          </div>
        </div>
      )}
    </div>
  );
}
