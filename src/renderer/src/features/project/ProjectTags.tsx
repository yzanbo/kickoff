import { X } from "lucide-react";
import { cx } from "@/lib/cx";
import { IconButton } from "@/ui/IconButton";

/**
 * プロジェクトのタグの小さなチップの列（サイドバーのカードの 2 行目・編集の「タグ」の欄）。
 * onRemove を渡すと、チップに外すボタン（×）を付ける
 */
export function ProjectTags({ tags, className, onRemove }: { tags: readonly string[]; className?: string; onRemove?: (tag: string) => void }) {
  if (tags.length === 0) return null;
  return (
    <span className={cx("project-tags", className)}>
      {tags.map((tag) => (
        <span key={tag} className="project-tag" title={onRemove ? undefined : `タグ: ${tag}`}>
          <span className="project-tag-name">{tag}</span>
          {onRemove && (
            <IconButton type="button" icon={X} size={11} className="project-tag-remove" label={`タグ「${tag}」を外す`} title="外す" onClick={() => onRemove(tag)} />
          )}
        </span>
      ))}
    </span>
  );
}
