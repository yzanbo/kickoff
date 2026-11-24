import type { Project } from "@shared/projects/types";
import { settingsSectionsOf } from "@/features/settings/ui";
import { TabbedDialog } from "@/foundation/ui/kit/TabbedDialog";
import { EditedProjectContext } from "./editedProject";

/**
 * プロジェクト名の横の「編集」・サイドバーの右クリックから開く、プロジェクトの設定（画面は移らない。initial で最初に開く節）。
 * 節は持ち主の機能が設定の節（scope: "project"）に登録したもの: 基本情報・参照資料・AI・GitHub・定型文・圧縮前・圧縮後指示・削除
 */
export function ProjectEditDialog({ project, initial, onClose }: { project: Project; initial?: string; onClose: () => void }) {
  const sections = settingsSectionsOf("project");
  return (
    <EditedProjectContext.Provider value={project}>
      <TabbedDialog
        title="プロジェクトを編集"
        label="設定の項目"
        sections={sections.map((s) => ({ key: s.id, label: s.label, icon: s.icon, danger: s.danger }))}
        initial={initial}
        onClose={onClose}
      >
        {(id) => {
          const Section = sections.find((s) => s.id === id)?.Component;
          return Section && <Section projectId={project.id} />;
        }}
      </TabbedDialog>
    </EditedProjectContext.Provider>
  );
}
