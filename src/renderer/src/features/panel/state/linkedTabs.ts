import type { Run } from "@shared/types";
import type { PanelTab } from "@/features/panel/usePanel";

export const chatKey = (id: number) => `chat:${id}`;

/** サイドバーと連動したチャットのタブの覚え（パネルごと） */
export interface LinkState {
  /** 「表示だけ消す」で閉じたチャット（サイドバーには残るが、タブには出さない。もう一度開けば出る） */
  dismissed: number[];
  /** サイドバーの一覧にないのに自分で開いたチャット（アーカイブ済みを隠しているときに検索から開いたものなど。閉じるまで残す） */
  extra: number[];
}

export const NO_LINKS: LinkState = { dismissed: [], extra: [] };

/**
 * パネルのチャットのタブを、サイドバーの一覧（linked。サイドバーと同じ並び）にそろえる。
 * 一覧にあって、まだタブがなく、表示だけ消していないチャットはタブを足し（一覧の並びで後ろへ）、
 * 一覧から外れたチャット（アーカイブして隠した・別のプロジェクトへ移した・消した）のタブは閉じる（自分で開いた extra は残す）。
 * 一覧に入った extra は extra から外す（次に一覧から外れたら閉じる）。変わらなければ同じ配列を返す
 */
export function syncLinkedTabs(tabs: PanelTab[], linked: readonly Run[], links: LinkState): { tabs: PanelTab[]; links: LinkState } {
  const linkedIds = new Set(linked.map((r) => r.id));
  const dismissed = new Set(links.dismissed);
  const extra = links.extra.filter((id) => !linkedIds.has(id));
  const keep = new Set([...linkedIds, ...extra]);
  const kept = tabs.filter((t) => t.kind !== "chat" || keep.has(t.id));
  const present = new Set(kept.flatMap((t) => (t.kind === "chat" ? [t.id] : [])));
  const added: PanelTab[] = linked
    .filter((r) => !present.has(r.id) && !dismissed.has(r.id))
    .map((r) => ({ key: chatKey(r.id), kind: "chat", id: r.id, projectId: r.project_id, title: r.title }));
  const nextTabs = kept.length === tabs.length && added.length === 0 ? tabs : [...kept, ...added];
  // 表示だけ消したチャットも、一覧から外れたら忘れる（次に一覧へ戻ったら、また出す）
  const nextDismissed = links.dismissed.filter((id) => linkedIds.has(id));
  const same = extra.length === links.extra.length && nextDismissed.length === links.dismissed.length;
  return { tabs: nextTabs, links: same ? links : { dismissed: nextDismissed, extra } };
}
