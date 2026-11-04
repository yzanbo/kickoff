import { useMemo } from "react";
import { useSetting } from "@/hooks/useSetting";
import { SIDEBAR_PROJECT_ORDER } from "@/lib/storageKeys";
import { useChats } from "@/stores/chats";
import { useProjects } from "@/stores/projects";
import { archivedProjects, sidebarOrder } from "./projectOrder";
import { useProjectTagFilter } from "./projectTagFilter";

/**
 * サイドバーと同じく見せるプロジェクト（サイドバー・全プロジェクトの画面・⌘⇧A・パネルのタブ・下のパネルで共通）:
 * active = しまっていない（アーカイブしていない）もの。サイドバーの並び（固定したものが先、そのあと見出しの「並び順」で手動の並び / 最近動いた順）。
 * visible = active のうち、見出しの「タグ」の絞り込みに合うもの（サイドバー・全プロジェクトのボードに出す並び）。
 * archived = しまったもの（名前順）のうち、タグの絞り込みに合うもの。
 * 最近動いた順は、プロジェクトのチャット（アーカイブしたものを除く）が最後に動いた時刻（チャットがなければ作った時刻）。そのときだけチャットの一覧を読む
 */
export function useVisibleProjects() {
  const { projects } = useProjects();
  const tagFilter = useProjectTagFilter();
  const [order] = useSetting(SIDEBAR_PROJECT_ORDER);
  const { chats } = useChats({ enabled: order === "recent" });
  const { selected, active: tagged } = tagFilter;
  const lists = useMemo(() => {
    // チャットの一覧は最後に動いた順なので、プロジェクトごとの最初のものがいちばん新しい
    const latest = new Map<number, string>();
    for (const chat of chats) if (!latest.has(chat.project_id)) latest.set(chat.project_id, chat.active_at);
    const active = sidebarOrder(projects, order === "recent" ? (p) => latest.get(p.id) ?? p.created_at : undefined);
    return {
      active,
      visible: tagged ? active.filter(tagFilter.matches) : active,
      archived: archivedProjects(projects).filter(tagFilter.matches),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- matches は selected だけで決まる
  }, [projects, order, chats, selected, tagged]);
  return { ...lists, tagFilter };
}
