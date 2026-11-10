import { Activity } from "lucide-react";
import { Fragment, useEffect, useMemo, useState, type KeyboardEvent } from "react";
import type { Chat } from "@shared/types";
import { useChatStates } from "@/app/chatStatesContext";
import { NEW_CHAT_TITLE, chatTitle } from "@/features/chat/chatTitle";
import { useChatsWithChildren } from "@/stores/chats";
import { openChatOrChild } from "@/features/chat/children/openChild";
import { useListNavigation } from "@/hooks/useListNavigation";
import { useModalDialog } from "@/hooks/useModalDialog";
import { useSetting } from "@/hooks/useSetting";
import { useProjects } from "@/stores/projects";
import { useVisibleProjects } from "@/features/project/useVisibleProjects";
import { TagFilterNotice } from "@/features/project/TagFilterNotice";
import { shortRelativeTime } from "@/lib/time";
import { DRAFT_TONE } from "@/features/chat/tones";
import { bucketTone, chatsByState } from "@/features/chatList/StateChatsPopover";
import { openDraft, useAllDrafts, type PanelDraft } from "@/features/panel/state/panelDrafts";
import { ToneChip } from "@/ui/ToneChip";
import { hiddenItemsOf, toggleHiddenItem } from "@/lib/hiddenItems";
import { ACTIVE_CHATS_HIDDEN_STATES, ACTIVE_CHATS_SHOW_ARCHIVED_PROJECTS } from "@/lib/storageKeys";
import { cycleProjectFilter, PaletteProjectFilter, type ProjectFilterOption, type ProjectFilterValue } from "./PaletteProjectFilter";
import { ACTIVE_STATE_LABELS, ACTIVE_STATES, PaletteStateFilter, type ActiveState } from "./PaletteStateFilter";

/** 一覧の 1 行: チャットか、送る前の新しいチャット（下書き） */
type Item = { kind: "chat"; key: string; chat: Chat } | { kind: "draft"; key: string; draft: PanelDraft };

/** 下書きの名前（書いた文の 1 行目。まだ書いていなければ「新しいチャット」） */
const draftTitle = (draft: PanelDraft) => draft.text.trim().split("\n")[0] || NEW_CHAT_TITLE;

/**
 * ⌘⇧A: 作業中・回答待ち・未読のチャットを、すべてのプロジェクトから状態ごとに並べる（⌘K と同じ形。子チャットも並べ、押すと設定の開き方で開く）。
 * 送る前の新しいチャット（下書き。サイドバー・ボードの「下書き」と同じもの）も、いちばん上に並べる。
 * 名前・プロジェクト名で絞り込め、↑↓・Enter で開く。開いている間もチャットの状態の変化に追いつく。
 * 入力欄の下の行で、プロジェクトでも絞り込める（すべて / プロジェクトごと。Tab / Shift+Tab でも切り替え。⌘⇧A で開くたびに「すべて」から。
 * プロジェクトのボタン・右クリックから開いたときは initialProject で絞り込んだところから）。
 * アーカイブ済みのプロジェクトのチャットは、行の右端の切り替えで出す（初めは隠す。覚えておく）。
 * その下の行で、並べる状態（下書き・作業中・回答待ち・未読）を選べる（いくつでも。1 つは残す。覚えておく。PaletteStateFilter）
 */
export function ActiveChatsPalette({ initialProject, onClose }: { initialProject?: number; onClose: () => void }) {
  const { projectName } = useProjects();
  // 出すプロジェクト: サイドバーと同じく、しまったものを除いた並び（サイドバーの「タグ」で絞り込んでいれば、合うものだけ）。
  // アーカイブ済みのプロジェクトは、行の右端の切り替えで出したときだけ後ろに足す
  const { visible, archived, tagFilter } = useVisibleProjects();
  const { pending } = useChatStates();
  const [query, setQuery] = useState("");
  // すべてのプロジェクトのチャット（子チャットも入れる。開いている間も、状態の変化・削除に追いつく）
  const chats = useChatsWithChildren();
  const dialog = useModalDialog();
  const drafts = useAllDrafts();
  const [project, setProject] = useState<ProjectFilterValue>(initialProject ?? "all");
  const [showArchived, setShowArchived] = useSetting(ACTIVE_CHATS_SHOW_ARCHIVED_PROJECTS);
  // 並べる状態（隠したものだけを覚える。すべて隠した値が残っていても、すべて出す）
  const [hiddenStates, setHiddenStates] = useSetting(ACTIVE_CHATS_HIDDEN_STATES);
  const shownStates = useMemo(() => {
    const hidden = hiddenItemsOf(ACTIVE_STATES, hiddenStates);
    return new Set<ActiveState>(hidden.size === ACTIVE_STATES.length ? ACTIVE_STATES : ACTIVE_STATES.filter((s) => !hidden.has(s)));
  }, [hiddenStates]);
  const toggleState = (state: ActiveState) => {
    // 最後の 1 つは外さない
    if (shownStates.has(state) && shownStates.size === 1) return;
    setHiddenStates(toggleHiddenItem(ACTIVE_STATES, hiddenStates, state));
  };

  // 状態ごとのまとまり（下書き → 作業中・回答待ち・未読。アーカイブしたもの・既読は除く。最近動いた順）と、↑↓ で移る平らな並び。
  // プロジェクトの絞り込みの選択肢には、ほかの絞り込み（文字・タグ・アーカイブ済みのプロジェクト・状態）を通ったものの数を、
  // 状態の絞り込みの選択肢には、文字・プロジェクトの絞り込みを通ったものの数を添える
  const { groups, items, total, options, selected, stateCounts } = useMemo(() => {
    const q = query.trim().toLowerCase();
    // 選べるプロジェクト（サイドバーの並び → アーカイブ済み）
    const ordered = showArchived ? [...visible, ...archived] : visible;
    const allowed = new Set(ordered.map((p) => p.id));
    const inFilter = (projectId: number) => allowed.has(projectId);
    const matches = (title: string, projectId: number) => inFilter(projectId) && (!q || `${title} ${projectName(projectId)}`.toLowerCase().includes(q));
    // 状態ごとのまとまり（作業中・回答待ち・未読。アーカイブしたもの・既読は入れない。中は最後に動いた順）
    const allSections = chatsByState(
      chats.filter((chat) => matches(chatTitle(chat.title), chat.project_id)),
      pending,
    );
    const allDrafts = drafts.filter((d) => matches(draftTitle(d), d.projectId));
    // 選んだ状態だけ（column は作業中・回答待ち・未読のどれか）
    const sections = allSections.filter((s) => s.column && shownStates.has(s.column as ActiveState));
    const baseChats = sections.flatMap((s) => s.chats);
    const baseDrafts = shownStates.has("draft") ? allDrafts : [];
    // プロジェクトごとの数と、選択肢（サイドバーの並び → アーカイブ済み。チャットのあるものと、選んでいるもの）
    const counts = new Map<number, number>();
    for (const id of [...baseChats.map((r) => r.project_id), ...baseDrafts.map((d) => d.projectId)]) counts.set(id, (counts.get(id) ?? 0) + 1);
    // 選んでいたプロジェクトが隠れた（アーカイブ済みを隠した・タグで外れた）ら「すべて」に戻す
    const selected: ProjectFilterValue = project !== "all" && inFilter(project) ? project : "all";
    const options: ProjectFilterOption[] = ordered
      .filter((p) => (counts.get(p.id) ?? 0) > 0 || p.id === selected)
      .map((p) => ({ id: p.id, name: p.name, count: counts.get(p.id) ?? 0, archived: Boolean(p.archived_at) }));
    const inProject = (projectId: number) => selected === "all" || projectId === selected;
    // 状態ごとの数（文字・プロジェクトの絞り込みを通ったもの。隠している状態も数える）
    const stateCounts = Object.fromEntries(ACTIVE_STATES.map((s) => [s, 0])) as Record<ActiveState, number>;
    stateCounts.draft = allDrafts.filter((d) => inProject(d.projectId)).length;
    for (const section of allSections) {
      if (section.column && section.column in stateCounts) stateCounts[section.column as ActiveState] = section.chats.filter((c) => inProject(c.project_id)).length;
    }

    const draftItems: Item[] = baseDrafts
      .filter((d) => inProject(d.projectId))
      .map((draft) => ({ kind: "draft", key: `draft:${draft.panel}:${draft.key}`, draft }));
    const groups = [
      { key: "draft", label: "下書き", tone: DRAFT_TONE, items: draftItems },
      ...sections.map((section) => ({
        key: section.key,
        label: section.label,
        tone: bucketTone(section),
        items: section.chats.filter((chat) => inProject(chat.project_id)).map((chat): Item => ({ kind: "chat", key: `chat:${chat.id}`, chat })),
      })),
    ].filter((g) => g.items.length > 0);
    return { groups, items: groups.flatMap((g) => g.items), total: baseChats.length + baseDrafts.length, options, selected, stateCounts };
  }, [chats, drafts, query, pending, visible, archived, projectName, project, showArchived, shownStates]);
  const archivedCount = archived.length;

  function go(item: Item | undefined) {
    if (!item) return;
    dialog.close();
    if (item.kind === "draft") openDraft(item.draft);
    else openChatOrChild(item.chat);
  }
  const nav = useListNavigation(items, go);
  useEffect(() => nav.setIndex(0), [query, selected, showArchived, shownStates]);
  // 入力欄の Tab / Shift+Tab でプロジェクトの絞り込みを順に切り替える（ほかのキーは一覧の ↑↓・Enter）
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Tab" && !e.metaKey && !e.altKey && !e.ctrlKey) {
      e.preventDefault();
      setProject(cycleProjectFilter(selected, options, e.shiftKey));
      return;
    }
    nav.onKeyDown(e);
  };
  // ↑↓ で選んだ行が見えるようにスクロールする
  useEffect(() => {
    dialog.ref.current?.querySelector(".palette-item.active")?.scrollIntoView({ block: "nearest" });
  }, [nav.index, dialog.ref]);

  return (
    <dialog ref={dialog.ref} className="palette" aria-label="作業中・待ちのチャット" onClose={onClose} {...dialog.backdropProps}>
      <div className="palette-input">
        <Activity size={16} className="muted" aria-hidden />
        <input
          autoFocus
          value={query}
          placeholder={`${ACTIVE_STATES.filter((s) => shownStates.has(s))
            .map((s) => ACTIVE_STATE_LABELS[s])
            .join("・")}のチャットを絞り込む`}
          aria-label="作業中・待ちのチャットを絞り込む"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <TagFilterNotice filter={tagFilter} />
      </div>
      <PaletteProjectFilter
        value={selected}
        total={total}
        options={options}
        onChange={setProject}
        archivedCount={archivedCount}
        showArchived={showArchived}
        onToggleArchived={() => setShowArchived(!showArchived)}
      />
      <PaletteStateFilter shown={shownStates} counts={stateCounts} onToggle={toggleState} />
      <ul className="palette-list" role="listbox">
        {items.length === 0 && <li className="palette-empty">{query.trim() ? "見つかりません" : shownStates.size < ACTIVE_STATES.length && total === 0 ? "選んだ状態のチャットはありません（上の行で状態を足せます）" : selected !== "all" ? "このプロジェクトに作業中・待ちのチャットはありません" : tagFilter.active ? "タグで絞り込んだプロジェクトに、作業中・待ちのチャットはありません" : "作業中・待ちのチャットはありません"}</li>}
        {groups.map((g) => (
          <Fragment key={g.key}>
            <li className="palette-group" role="presentation">
              <ToneChip tone={g.tone} dot label={g.label} count={g.items.length} />
            </li>
            {g.items.map((item) => {
              const i = items.indexOf(item);
              return (
                <li key={item.key} role="option" aria-selected={i === nav.index}>
                  <button
                    className={`palette-item ${i === nav.index ? "active" : ""}`}
                    onMouseEnter={() => nav.setIndex(i)}
                    onClick={() => go(item)}
                  >
                    {item.kind === "draft" ? (
                      <>
                        <span className="palette-label">{draftTitle(item.draft)}</span>
                        {/* 「下書き」のまとまりの見出しの下に並ぶので、プロジェクト名だけを添える */}
                        <span className="palette-hint">{projectName(item.draft.projectId)}</span>
                      </>
                    ) : (
                      <>
                        <span className="palette-label">{chatTitle(item.chat.title)}</span>
                        <span className="palette-hint">
                          {projectName(item.chat.project_id)} · {shortRelativeTime(item.chat.active_at)}
                        </span>
                      </>
                    )}
                  </button>
                </li>
              );
            })}
          </Fragment>
        ))}
      </ul>
    </dialog>
  );
}
