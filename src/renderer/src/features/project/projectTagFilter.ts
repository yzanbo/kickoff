import { useMemo } from "react";
import { collectTags, matchesTags, orderTags, UNTAGGED } from "@shared/project/tags";
import type { Project } from "@shared/types";
import { useSetting } from "@/hooks/useSetting";
import { useProjects } from "@/stores/projects";
import { moveView } from "@/lib/namedViews";
import { PROJECT_TAG_FILTER, PROJECT_TAG_ORDER } from "@/lib/storageKeys";

export type ProjectTagFilter = ReturnType<typeof useProjectTagFilter>;

/** 絞り込みのタグの表示名（タグなしは「タグなし」） */
export const tagLabel = (tag: string) => (tag === UNTAGGED ? "タグなし" : tag);

/**
 * 使っているタグ（しまったプロジェクトの分も含む）を、サイドバーのタグの行でドラッグして並べた順に（並べていないタグは後ろに名前順）。
 * タグの行・プロジェクトの右クリックのタグで同じ順にする
 */
export function useOrderedTags(): { tags: string[]; order: readonly string[]; setOrder: (order: string[]) => void } {
  const { projects } = useProjects();
  const [order, setOrder] = useSetting(PROJECT_TAG_ORDER);
  const tags = useMemo(() => orderTags(collectTags(projects), order), [projects, order]);
  return { tags, order, setOrder };
}

/**
 * プロジェクトのタグでの絞り込み（サイドバーの見出しの「タグ」で選ぶ）。選んだタグのどれかが付いているプロジェクトだけを出す。
 * サイドバーの並び・全プロジェクトの画面・⌘⇧A・プロジェクトの切り替え（⌃Tab など）で、どこからでも同じ値を読む（部品どうしでそろう）。
 * どのプロジェクトにももう付いていないタグは、選んでいても無いものとして扱う（すべて消えたら絞り込まない）
 */
export function useProjectTagFilter() {
  const { tags, setOrder } = useOrderedTags();
  const [stored, setStored] = useSetting(PROJECT_TAG_FILTER);
  const selected = useMemo(() => stored.filter((t) => t === UNTAGGED || tags.includes(t)), [stored, tags]);
  const active = selected.length > 0;
  return {
    /** 使っているタグ（並べた順） */
    tags,
    /** タグ moved を target の前・後ろへ動かす（ドラッグ。並べた順として覚える） */
    move: (moved: string, target: string, side: "before" | "after") =>
      setOrder(moveView(tags.map((t) => ({ id: t, name: t, state: null })), moved, target, side).map((v) => v.id)),
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
