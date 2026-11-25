import "./CompactPromptEditor.css";
import { useState } from "react";
import { COMPACT_PROMPT_MAX } from "@shared/projects/types";
import { useFold } from "@/foundation/ui/hooks/useFold";
import { useProjects } from "@/features/projects/ui";
import { Chevron } from "@/foundation/ui/kit/Chevron";
import { ResultMessage } from "@/foundation/ui/kit/SaveActions";
import { Segmented } from "@/foundation/ui/kit/Segmented";
import { COMPACT_PROMPT_KINDS, COMPACT_PROMPT_SWITCH } from "./compactPromptKinds";
import type { CompactPromptKind } from "@shared/chat/prompts";
import { useCompactPrompt } from "./useCompactPrompt";

type Scope = "common" | "project";

/** 書いてある指示の範囲 1 つ分（文がなければ null。オフなら「（オフ）」を添える） */
function partOf(name: string, prompt: { saved: string | null; enabled: boolean }): string | null {
  if (prompt.saved === null) return null;
  return prompt.enabled ? name : `${name}（オフ）`;
}

/** 開閉の行に添える、書いてある指示の範囲（プロジェクトの分はプロジェクト名で。オフのものは「（オフ）」付き） */
function summaryOf(common: { saved: string | null; enabled: boolean }, project: { saved: string | null; enabled: boolean }, projectName: string): string {
  const parts = [partOf("すべて", common), partOf(projectName, project)].filter((p): p is string => p !== null);
  return parts.length > 0 ? parts.join(" ＋ ") : "なし";
}

/**
 * チャット欄のメーターの詳細の「圧縮前指示」「圧縮後指示」: 会話を圧縮する前・後に AI に送る指示を、その場で書いて保存する（設定の「圧縮前・圧縮後指示」の欄と同じ値）。
 * 開閉の行（初めは閉じる。開いているかは種類ごとに覚える）に、書いてある指示の範囲（オフのものは「（オフ）」付き）を添える。開くと、すべてのプロジェクト / プロジェクト（名前で出す）を切り替えて書く
 * （両方の書きかけを持ち、切り替えても消さない。送るときはオンの分をすべて → プロジェクトの順につなぐ）。右のオン / オフは選んでいる方の分で、押したらすぐ保存する（オフでも文は残す）
 */
export function CompactPromptEditor({ kind, projectId }: { kind: CompactPromptKind; projectId: number }) {
  const { label, placeholder, when } = COMPACT_PROMPT_KINDS[kind];
  const fold = useFold("composer", `${kind}-compact`, { defaultOpen: false });
  const common = useCompactPrompt(kind, null);
  const project = useCompactPrompt(kind, projectId);
  const projectName = useProjects().projectsById.get(projectId)?.name ?? "このプロジェクト";
  // 初めは、指示のあるほう（どちらにもなければすべてのプロジェクト）
  const [scope, setScope] = useState<Scope>(() => (project.saved !== null && common.saved === null ? "project" : "common"));
  const current = scope === "common" ? common : project;

  return (
    <div className="context-pre-compact">
      <button type="button" className="context-pre-compact-toggle" aria-expanded={fold.open} onClick={fold.toggle}>
        <span className="context-pre-compact-label">{label}</span>
        <span className="context-pre-compact-summary">{summaryOf(common, project, projectName)}</span>
        <Chevron open={fold.open} />
      </button>
      {fold.open && (
        <div className="context-pre-compact-body card">
          <div className="context-pre-compact-head">
            <Segmented
              size="sm"
              className="context-pre-compact-scope"
              label={`${label}の範囲`}
              value={scope}
              onChange={setScope}
              options={[
                { value: "common", label: "すべて", tip: "すべてのプロジェクト（共通のチャットも）で送る指示（設定の「圧縮前・圧縮後指示」と同じ）" },
                { value: "project", label: projectName, tip: `「${projectName}」だけで、すべてのプロジェクトの指示のあとにつなげて送る指示` },
              ]}
            />
            <Segmented<"on" | "off">
              size="sm"
              className="context-pre-compact-switch"
              label={scope === "common" ? `すべてのプロジェクトの${label}を送る` : `「${projectName}」の${label}を送る`}
              value={current.enabled ? "on" : "off"}
              options={COMPACT_PROMPT_SWITCH}
              onChange={(v) => current.setEnabled(v === "on")}
            />
          </div>
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
            <ResultMessage result={current.save.result} />
            <button type="button" className="btn btn-primary" data-size="sm" disabled={!current.dirty || current.save.busy !== null} onClick={() => void current.save.run("save", current.submit, { done: "保存しました" })}>
              {current.save.busy !== null ? "保存中…" : "保存"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
