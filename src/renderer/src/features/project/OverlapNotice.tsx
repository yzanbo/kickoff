import { useProjects } from "@/stores/projects";
import { folderOverlapLines, folderOverlaps, type OverlapLine } from "./folderOverlaps";

const ICONS = { ng: "✕", warn: "⚠" } as const;

/** 被りの知らせの行（点検の一覧と同じ見た目。なければ何も出さない） */
export function OverlapList({ lines }: { lines: readonly OverlapLine[] }) {
  if (lines.length === 0) return null;
  return (
    <ul className="inspection overlap-notice">
      {lines.map((line) => (
        <li key={line.text} className={`inspection-${line.kind}`}>
          <span className="inspection-icon" aria-hidden>
            {ICONS[line.kind]}
          </span>
          <span>{line.text}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * プロジェクトフォルダの被り（ほかのプロジェクトと同じ・その中・中にある）の知らせ。path はリンクを解いた実体。
 * same: 同じフォルダは作れない（ng。新しく作る）/ 知らせる（warn。基本情報。取り込みは点検の一覧 InspectionPanel が同じ文を出す）
 */
export function FolderOverlapNotice({ path, except, same }: { path: string | undefined; except?: number; same: "ng" | "warn" }) {
  const { projects } = useProjects();
  if (!path) return null;
  return <OverlapList lines={folderOverlapLines(folderOverlaps(path, projects, except), same)} />;
}
