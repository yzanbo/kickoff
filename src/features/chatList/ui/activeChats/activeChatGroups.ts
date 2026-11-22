// ⌘⇧A の一覧の中身の決め方（純粋）: 文字・プロジェクト・状態で絞り込み、状態ごとのまとまり（下書き → 作業中・回答待ち・未読）と、
// プロジェクトの絞り込みの選択肢・状態ごとの数を作る。描くのは ActiveChatsPalette
import type { Chat } from "@shared/chat/types";
import type { Project } from "@shared/projects/types";
import { DRAFT_LOOK, type StateTone } from "@shared/chat/stateLooks";
import { chatTitle, type ApprovalIndex } from "@/features/chat/ui";
import { ACTIVE_URGENCY } from "@shared/chatList/urgency";
import { draftTitleOf, type NewChatDraft } from "@/features/composer/ui";
import type { ChatBucket } from "@/features/chatList/ui/buckets";
import { bucketTone, chatsByState } from "@/features/chatList/ui/StateChatsPopover";
import type { ProjectFilterOption, ProjectFilterValue } from "./PaletteProjectFilter";

/** ⌘⇧A で並べる状態（下書き → 急ぐ順の作業中・回答待ち・未読。この順に並べる） */
export type ActiveState = "draft" | (typeof ACTIVE_URGENCY)[number];
export const ACTIVE_STATES: readonly ActiveState[] = ["draft", ...ACTIVE_URGENCY];

/** 一覧に出す下書き（送る前の新しいチャット。panel はタブのある欄 = chatPanel の PlacedDraft） */
export type ActiveDraft = NewChatDraft & { panel: string };

/** 一覧の 1 行: チャットか、送る前の新しいチャット（下書き） */
export type ActiveItem<D extends ActiveDraft = ActiveDraft> = { kind: "chat"; key: string; chat: Chat } | { kind: "draft"; key: string; draft: D };

/** 状態ごとのまとまり（section は作業中・回答待ち・未読のまとまり。見出しの札の印に使う。下書きはなし） */
export interface ActiveGroup<D extends ActiveDraft = ActiveDraft> {
  key: string;
  label: string;
  tone: StateTone;
  section?: ChatBucket;
  items: ActiveItem<D>[];
}

export interface ActiveChatsInput<D extends ActiveDraft> {
  /** 出せるプロジェクトのチャット（useAllProjectChats。アーカイブしたもの・既読は中で除く） */
  chats: readonly Chat[];
  drafts: readonly D[];
  query: string;
  /** 選べるプロジェクト（サイドバーの並び → 出しているならアーカイブ済み） */
  projects: readonly Project[];
  projectName(id: number): string;
  /** 選んでいるプロジェクト（隠れたら「すべて」に戻す） */
  project: ProjectFilterValue;
  shownStates: ReadonlySet<ActiveState>;
  pending: ApprovalIndex;
}

export interface ActiveChatGroups<D extends ActiveDraft> {
  groups: ActiveGroup<D>[];
  /** ↑↓ で移る平らな並び */
  items: ActiveItem<D>[];
  /** 選んだ状態の数（プロジェクトで絞る前） */
  total: number;
  options: ProjectFilterOption[];
  selected: ProjectFilterValue;
  /** 状態ごとの数（文字・プロジェクトの絞り込みを通ったもの。隠している状態も数える） */
  stateCounts: Record<ActiveState, number>;
}

/**
 * 状態ごとのまとまり（下書き → 作業中・回答待ち・未読。アーカイブしたもの・既読は除く。最近動いた順）と、↑↓ で移る平らな並び。
 * プロジェクトの絞り込みの選択肢には、ほかの絞り込み（文字・タグ・アーカイブ済みのプロジェクト・状態）を通ったものの数を、
 * 状態の絞り込みの選択肢には、文字・プロジェクトの絞り込みを通ったものの数を添える
 */
export function activeChatGroups<D extends ActiveDraft>({ chats, drafts, query, projects, projectName, project, shownStates, pending }: ActiveChatsInput<D>): ActiveChatGroups<D> {
  const q = query.trim().toLowerCase();
  const allowed = new Set(projects.map((p) => p.id));
  const inFilter = (projectId: number) => allowed.has(projectId);
  const matches = (title: string, projectId: number) => inFilter(projectId) && (!q || `${title} ${projectName(projectId)}`.toLowerCase().includes(q));
  // 状態ごとのまとまり（作業中・回答待ち・未読。アーカイブしたもの・既読は入れない。中は最後に動いた順）
  const allSections = chatsByState(
    chats.filter((chat) => matches(chatTitle(chat.title), chat.project_id)),
    pending,
  );
  const allDrafts = drafts.filter((d) => matches(draftTitleOf(d), d.projectId));
  // 選んだ状態だけ（column は作業中・回答待ち・未読のどれか）
  const sections = allSections.filter((s) => s.column && shownStates.has(s.column as ActiveState));
  const baseChats = sections.flatMap((s) => s.chats);
  const baseDrafts = shownStates.has("draft") ? allDrafts : [];
  // プロジェクトごとの数と、選択肢（サイドバーの並び → アーカイブ済み。チャットのあるものと、選んでいるもの）
  const counts = new Map<number, number>();
  for (const id of [...baseChats.map((r) => r.project_id), ...baseDrafts.map((d) => d.projectId)]) counts.set(id, (counts.get(id) ?? 0) + 1);
  // 選んでいたプロジェクトが隠れた（アーカイブ済みを隠した・タグで外れた）ら「すべて」に戻す
  const selected: ProjectFilterValue = project !== "all" && inFilter(project) ? project : "all";
  const options: ProjectFilterOption[] = projects
    .filter((p) => (counts.get(p.id) ?? 0) > 0 || p.id === selected)
    .map((p) => ({ id: p.id, name: p.name, count: counts.get(p.id) ?? 0, archived: Boolean(p.archived_at) }));
  const inProject = (projectId: number) => selected === "all" || projectId === selected;
  const stateCounts = Object.fromEntries(ACTIVE_STATES.map((s) => [s, 0])) as Record<ActiveState, number>;
  stateCounts.draft = allDrafts.filter((d) => inProject(d.projectId)).length;
  for (const section of allSections) {
    if (section.column && section.column in stateCounts) stateCounts[section.column as ActiveState] = section.chats.filter((c) => inProject(c.project_id)).length;
  }
  const draftItems: ActiveItem<D>[] = baseDrafts.filter((d) => inProject(d.projectId)).map((draft) => ({ kind: "draft", key: `draft:${draft.panel}:${draft.key}`, draft }));
  const groups: ActiveGroup<D>[] = [
    { key: "draft", label: DRAFT_LOOK.label, tone: DRAFT_LOOK.tone, items: draftItems },
    ...sections.map((section) => ({
      key: section.key,
      label: section.label,
      tone: bucketTone(section),
      section,
      items: section.chats.filter((chat) => inProject(chat.project_id)).map((chat): ActiveItem<D> => ({ kind: "chat", key: `chat:${chat.id}`, chat })),
    })),
  ].filter((g) => g.items.length > 0);
  return { groups, items: groups.flatMap((g) => g.items), total: baseChats.length + baseDrafts.length, options, selected, stateCounts };
}
