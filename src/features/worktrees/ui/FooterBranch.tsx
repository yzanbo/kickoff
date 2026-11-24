import { GitBranch } from "lucide-react";
import { href } from "@/foundation/ui/navigation/router";
import { useMainBranch } from "@/foundation/ui/workplace/useWorkplace";

/** 下の帯の、いまのプロジェクト（本体）のブランチ（全プロジェクトの画面では出さない） */
export function FooterBranch({ projectId }: { projectId: number | undefined }) {
  return projectId === undefined ? null : <MainBranch projectId={projectId} />;
}

/** VS Code の左下と同じ。押すと変更タブを開く */
function MainBranch({ projectId }: { projectId: number }) {
  const branch = useMainBranch(projectId);
  if (!branch) return null;
  return (
    <a className="footer-button footer-branch" href={href({ name: "project", id: projectId, tab: "changes" })} title={`ブランチ（本体）: ${branch}\n押すと変更タブを開きます`}>
      <GitBranch size={13} aria-hidden /> {branch}
    </a>
  );
}
