import { useMemo } from "react";
import { collectTags, matchesTags, UNTAGGED } from "@shared/project/tags";
import type { Project } from "@shared/types";
import { useSetting } from "@/hooks/useSetting";
import { useProjects } from "@/app/projectsContext";
import { PROJECT_TAG_FILTER } from "@/lib/storageKeys";

export type ProjectTagFilter = ReturnType<typeof useProjectTagFilter>;

/** 絞り込みのタグの表示名（タグなしは「タグなし」） */
export const tagLabel = (tag: string) => (tag === UNTAGGED ? "タグなし" : tag);

/**
 * プロジェクトのタグでの絞り込み（サイドバーの見出しの「タグ」で選ぶ）。選んだタグのどれかが付いているプロジェクトだけを出す。
 * サイドバーの並び・全プロジェクトの画面・⌘⇧A・プロジェクトの切り替え（⌃Tab など）で、どこからでも同じ値を読む（部品どうしでそろう）。
 * どのプロジェクトにももう付いていないタグは、選んでいても無いものとして扱う（すべて消えたら絞り込まない）
 */
export function useProjectTagFilter() {
  const { projects } = useProjects();
  const [stored, setStored] = useSetting(PROJECT_TAG_FILTER);
  // 使っているタグ（しまったプロジェクトの分も含む。名前順）
  const tags = useMemo(() => collectTags(projects), [projects]);
  const selected = useMemo(() => stored.filter((t) => t === UNTAGGED || tags.includes(t)), [stored, tags]);
  const active = selected.length > 0;
  return {
    /** 使っているタグ（名前順） */
    tags,
    /** 選んでいるタグ（UNTAGGED はタグなし） */
    selected,
    /** 絞り込んでいるか */
    active,
    /** タグを選ぶ・外す */
    toggle: (tag: string) => setStored(selected.includes(tag) ? selected.filter((t) => t !== tag) : [...selected, tag]),
    /** 絞り込みを外す（すべて） */
    clear: () => setStored([]),
    /** 絞り込みに合うプロジェクトか */
    matches: (project: Pick<Project, "tags">) => matchesTags(project.tags, selected),
  };
}
