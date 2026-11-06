import { useState } from "react";
import { COMPACT_PROMPT_MAX } from "@shared/chat/prompts";
import { useFold } from "@/hooks/useFold";
import { useProjects } from "@/stores/projects";
import { Chevron } from "@/ui/Chevron";
import { ResultMessage } from "@/ui/SaveActions";
import { Segmented } from "@/ui/Segmented";
import { COMPACT_PROMPT_KINDS, type CompactPromptKind } from "./compactPromptKinds";
import { useCompactPrompt } from "./useCompactPrompt";

type Scope = "common" | "project";

/** 開閉の行に添える、いま送る指示の範囲（プロジェクトの分はプロジェクト名で） */
function summaryOf(common: boolean, project: boolean, projectName: string): string {
  if (common && project) return `共通 ＋ ${projectName}`;
  if (common) return "共通";
  if (project) return projectName;
  return "なし";
}

/**
 * チャット欄のメーターの詳細の「圧縮前指示」「圧縮後指示」: 会話を圧縮する前・後に AI に送る指示を、その場で書いて保存する（設定の「定型文」の欄と同じ値）。
 * 開閉の行（初めは閉じる。開いているかは種類ごとに覚える）に、いま送る指示の範囲を添える。開くと、共通 / プロジェクト（名前で出す）を切り替えて書く
 * （両方の書きかけを持ち、切り替えても消さない。送るときは共通 → プロジェクトの順につなぐ）
 */
export function CompactPromptEditor({ kind, projectId }: { kind: CompactPromptKind; projectId: number }) {
  const { label, placeholder, when } = COMPACT_PROMPT_KINDS[kind];
  const fold = useFold("composer", `${kind}-compact`, { defaultOpen: false });
  const common = useCompactPrompt(kind, null);
  const project = useCompactPrompt(kind, projectId);
  const projectName = useProjects().projectsById.get(projectId)?.name ?? "このプロジェクト";
  // 初めは、指示のあるほう（どちらにもなければ共通）
  const [scope, setScope] = useState<Scope>(() => (project.saved !== null && common.saved === null ? "project" : "common"));
  const current = scope === "common" ? common : project;

  return (
    <div className="context-pre-compact">
      <button type="button" className="context-pre-compact-toggle" aria-expanded={fold.open} onClick={fold.toggle}>
        <span className="context-pre-compact-label">{label}</span>
        <span className="context-pre-compact-summary">{summaryOf(common.saved !== null, project.saved !== null, projectName)}</span>
        <Chevron open={fold.open} />
      </button>
      {fold.open && (
        <div className="context-pre-compact-body">
          <Segmented
            className="segmented context-pre-compact-scope"
            label={`${label}の範囲`}
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
            maxLength={COMPACT_PROMPT_MAX}
            aria-label={scope === "common" ? `すべてのプロジェクトの${label}` : `「${projectName}」の${label}`}
            placeholder={placeholder}
            onChange={(e) => current.setDraft(e.target.value)}
          />
          <div className="context-pre-compact-actions">
            <p className="context-sub">{when}</p>
            <ResultMessage result={current.save.message} />
            <button type="button" className="btn btn-sm btn-primary" disabled={!current.dirty || current.save.saving} onClick={() => void current.save.run(current.submit)}>
              {current.save.saving ? "保存中…" : "保存"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
