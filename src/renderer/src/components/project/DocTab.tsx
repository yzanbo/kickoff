import { Plus } from "lucide-react";
import type { Artifact, Project } from "../../../../core/types";
import { openNewChat } from "../../router";
import { SECTION_META } from "../../sections";
import { Markdown } from "../Markdown";
import { SectionBadge } from "../SectionBadge";

/** 要件定義書・スケジュールのタブ（そのセクションの成果物を Markdown で出し、チャットで作る・見直す） */
export function DocTab({ project, kind, artifacts }: { project: Project; kind: "requirements" | "schedule"; artifacts: Artifact[] }) {
  const doc = artifacts.find((a) => a.kind === kind);
  return (
    <section className="section">
      <div className="doc-toolbar">
        <SectionBadge section={kind} />
        {doc && (
          <span className="muted small">
            {doc.file_path && `${doc.file_path} ・ `}
            {new Date(doc.created_at).toLocaleString("ja-JP")} 更新
          </span>
        )}
        <span className="spacer" />
        <button className="btn" onClick={() => openNewChat(project.id, { section: kind })}>
          <Plus size={14} /> {doc ? "チャットで見直す" : "チャットで作る"}
        </button>
      </div>
      {doc ? (
        <article className="doc-card">
          <Markdown>{doc.content}</Markdown>
        </article>
      ) : (
        <div className="empty">まだありません。{SECTION_META[kind].label}のチャットで AI と話すと、ここにまとまります。</div>
      )}
    </section>
  );
}
