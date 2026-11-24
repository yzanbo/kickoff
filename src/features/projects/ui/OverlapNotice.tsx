import { useProjects } from "@/features/projects/ui/stores/projects";
import { folderOverlapLines, folderOverlaps } from "./folderOverlaps";
import { InspectionList } from "./InspectionList";

/**
 * プロジェクトフォルダの被り（ほかのプロジェクトと同じ・その中・中にある）の知らせ。path はリンクを解いた実体。
 * same: 同じフォルダは作れない（ng。新しく作る）/ 知らせる（warn。基本情報。取り込みは点検の一覧 InspectionPanel が同じ文を出す）
 */
export function FolderOverlapNotice({ path, except, same }: { path: string | undefined; except?: number; same: "ng" | "warn" }) {
  const { projects } = useProjects();
  if (!path) return null;
  return <InspectionList className="overlap-notice" items={folderOverlapLines(folderOverlaps(path, projects, except), same)} />;
}
