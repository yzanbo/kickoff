import type { Chat } from "@shared/types";
import { chatTab } from "@/features/panel/tabs/tabKinds";
import type { PanelTab } from "@/features/panel/tabs/panelTypes";

/** サイドバーと連動したチャットのタブの覚え（パネルごと） */
export interface LinkState {
  /** サイドバーに出ているチャット（最後にそろえたときの一覧の ID） */
  linked: readonly number[];
  /** 「表示だけ消す」で閉じたチャット（サイドバーには残るが、タブには出さない。もう一度開けば出る） */
  dismissed: readonly number[];
  /** サイドバーの一覧にないのに自分で開いたチャット（アーカイブ済みを隠しているときに検索から開いたものなど。閉じるまで残す） */
  extra: readonly number[];
}

export const NO_LINKS: LinkState = { linked: [], dismissed: [], extra: [] };

/** 同じ ID の集まりか（並びは見ない。並びが変わっただけで覚えを作り直さない） */
const sameIds = (a: readonly number[], b: ReadonlySet<number>) => a.length === b.size && a.every((id) => b.has(id));

/** チャットのタブを開いたとき: 表示だけ消していたら忘れ（またタブに出す）、サイドバーの一覧になければ閉じるまで残す */
export function openedLinks(links: LinkState, chatId: number): LinkState {
  const dismissed = links.dismissed.filter((id) => id !== chatId);
  const extra = links.linked.includes(chatId) || links.extra.includes(chatId) ? links.extra : [...links.extra, chatId];
  return dismissed.length === links.dismissed.length && extra === links.extra ? links : { ...links, dismissed, extra };
}

/**
 * チャットのタブを閉じたとき: 利用者が閉じた（dismiss。表示だけ消す）サイドバーのチャットは、連動で出し直さないよう覚える
 * （アーカイブ・削除で閉じるときは覚えない）。自分で開いたものの覚えは消す
 */
export function closedLinks(links: LinkState, chatIds: readonly number[], dismiss: boolean): LinkState {
  if (chatIds.length === 0) return links;
  const dismissed = dismiss ? [...new Set([...links.dismissed, ...chatIds.filter((id) => links.linked.includes(id))])] : links.dismissed;
  return { ...links, dismissed, extra: links.extra.filter((id) => !chatIds.includes(id)) };
}

/**
 * パネルのチャットのタブを、サイドバーの一覧（linked。サイドバーと同じ並び）にそろえる。
 * 一覧にあって、まだタブがなく、表示だけ消していないチャットはタブを足し（一覧の並びで後ろへ）、
 * 一覧から外れたチャット（アーカイブして隠した・別のプロジェクトへ移した・消した）のタブは閉じる（自分で開いた extra は残す）。
 * 一覧に入った extra は extra から外す（次に一覧から外れたら閉じる）。変わらなければ同じ配列と同じ覚えを返す
 */
export function syncLinkedTabs(tabs: readonly PanelTab[], linked: readonly Chat[], links: LinkState): { tabs: readonly PanelTab[]; links: LinkState } {
  const linkedIds = new Set(linked.map((r) => r.id));
  const dismissed = new Set(links.dismissed);
  const extra = links.extra.filter((id) => !linkedIds.has(id));
  const keep = new Set([...linkedIds, ...extra]);
  const kept = tabs.filter((t) => t.kind !== "chat" || keep.has(t.id));
  const present = new Set(kept.flatMap((t) => (t.kind === "chat" ? [t.id] : [])));
  const added = linked.filter((r) => !present.has(r.id) && !dismissed.has(r.id)).map((r) => chatTab(r));
  const nextTabs = kept.length === tabs.length && added.length === 0 ? tabs : [...kept, ...added];
  // 表示だけ消したチャットも、一覧から外れたら忘れる（次に一覧へ戻ったら、また出す）
  const nextDismissed = links.dismissed.filter((id) => linkedIds.has(id));
  const nextLinked = sameIds(links.linked, linkedIds) ? links.linked : [...linkedIds];
  const same = nextLinked === links.linked && extra.length === links.extra.length && nextDismissed.length === links.dismissed.length;
  return { tabs: nextTabs, links: same ? links : { linked: nextLinked, dismissed: nextDismissed, extra } };
}
