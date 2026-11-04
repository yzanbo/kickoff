import { Activity } from "lucide-react";
import { Fragment, useEffect, useMemo, useState, type KeyboardEvent } from "react";
import { boardColumnOf } from "@shared/chat/state";
import { BOARD_COLUMN_LABELS, type Chat } from "@shared/types";
import { useChatStates } from "@/app/chatStatesContext";
import { NEW_CHAT_TITLE, chatTitle } from "@/features/chat/chatTitle";
import { useChats } from "@/stores/chats";
import { useListNavigation } from "@/hooks/useListNavigation";
import { useModalDialog } from "@/hooks/useModalDialog";
import { useSetting } from "@/hooks/useSetting";
import { archivedProjects, sidebarOrder } from "@/features/project/projectOrder";
import { useProjects } from "@/app/projectsContext";
import { useProjectTagFilter } from "@/features/project/projectTagFilter";
import { TagFilterNotice } from "@/features/project/TagFilterNotice";
import { openChat } from "@/app/router";
import { COUNTED_COLUMNS } from "@/features/chat/chatState";
import { shortRelativeTime } from "@/lib/time";
import { COLUMN_TONE, DRAFT_TONE } from "@/features/chat/tones";
import { openDraft, useAllDrafts, type SidebarDraft } from "@/features/panel/state/panelMemory";
import { StatusDot } from "@/ui/StatusDot";
import { ACTIVE_CHATS_SHOW_ARCHIVED_PROJECTS } from "@/lib/storageKeys";
import { cycleProjectFilter, PaletteProjectFilter, type ProjectFilterOption, type ProjectFilterValue } from "./PaletteProjectFilter";

type CountedColumn = (typeof COUNTED_COLUMNS)[number];

/** 一覧の 1 行: チャットか、送る前の新しいチャット（下書き） */
type Item = { kind: "chat"; key: string; chat: Chat } | { kind: "draft"; key: string; draft: SidebarDraft };

/** 下書きの名前（書いた文の 1 行目。まだ書いていなければ「新しいチャット」） */
const draftTitle = (draft: SidebarDraft) => draft.text.trim().split("\n")[0] || NEW_CHAT_TITLE;

/**
 * ⌘⇧A: 作業中・回答待ち・未読のチャットを、すべてのプロジェクトから状態ごとに並べる（⌘K と同じ形）。
 * 送る前の新しいチャット（下書き。サイドバー・ボードの「下書き」と同じもの）も、いちばん上に並べる。
 * 名前・プロジェクト名で絞り込め、↑↓・Enter で開く。開いている間もチャットの状態の変化に追いつく。
 * 入力欄の下の行で、プロジェクトでも絞り込める（すべて / プロジェクトごと。Tab / Shift+Tab でも切り替え。開くたびに「すべて」から）。
 * アーカイブ済みのプロジェクトのチャットは、行の右端の切り替えで出す（初めは隠す。覚えておく）
 */
export function ActiveChatsPalette({ onClose }: { onClose: () => void }) {
  const { projects, projectName, projectsById } = useProjects();
  // サイドバーの「タグ」で絞り込んでいれば、合うプロジェクトのチャットだけ
  const tagFilter = useProjectTagFilter();
  const { stateOf } = useChatStates();
  const [query, setQuery] = useState("");
  // すべてのプロジェクトのチャット（開いている間も、状態の変化・削除に追いつく）
  const { chats } = useChats();
  const dialog = useModalDialog();
  const drafts = useAllDrafts();
  const [project, setProject] = useState<ProjectFilterValue>("all");
  const [showArchived, setShowArchived] = useSetting(ACTIVE_CHATS_SHOW_ARCHIVED_PROJECTS);

  // 状態ごとのまとまり（下書き → 作業中・回答待ち・未読。アーカイブしたもの・既読は除く。最近動いた順）と、↑↓ で移る平らな並び。
  // プロジェクトの絞り込みの選択肢には、ほかの絞り込み（文字・タグ・アーカイブ済みのプロジェクト）を通ったものの数を添える
  const { groups, items, total, options, selected } = useMemo(() => {
    const q = query.trim().toLowerCase();
    const inFilter = (projectId: number) => {
      const p = projectsById.get(projectId);
      if (!p || (p.archived_at && !showArchived)) return false;
      return !tagFilter.active || tagFilter.matches(p);
    };
    const matches = (title: string, projectId: number) => inFilter(projectId) && (!q || `${title} ${projectName(projectId)}`.toLowerCase().includes(q));
    const baseChats = chats.filter((chat) => !chat.archived_at && COUNTED_COLUMNS.includes(boardColumnOf(stateOf(chat)) as CountedColumn) && matches(chatTitle(chat.title), chat.project_id));
    const baseDrafts = drafts.filter((d) => matches(draftTitle(d), d.projectId));
    // プロジェクトごとの数と、選択肢（サイドバーの並び → アーカイブ済み。チャットのあるものと、選んでいるもの）
    const counts = new Map<number, number>();
    for (const id of [...baseChats.map((r) => r.project_id), ...baseDrafts.map((d) => d.projectId)]) counts.set(id, (counts.get(id) ?? 0) + 1);
    const ordered = [...sidebarOrder(projects), ...(showArchived ? archivedProjects(projects) : [])];
    // 選んでいたプロジェクトが隠れた（アーカイブ済みを隠した・タグで外れた）ら「すべて」に戻す
    const selected: ProjectFilterValue = project !== "all" && inFilter(project) ? project : "all";
    const options: ProjectFilterOption[] = ordered
      .filter((p) => inFilter(p.id) && ((counts.get(p.id) ?? 0) > 0 || p.id === selected))
      .map((p) => ({ id: p.id, name: p.name, count: counts.get(p.id) ?? 0, archived: Boolean(p.archived_at) }));
    const inProject = (projectId: number) => selected === "all" || projectId === selected;

    const byColumn = new Map<CountedColumn, Chat[]>(COUNTED_COLUMNS.map((c) => [c, []]));
    for (const chat of baseChats) if (inProject(chat.project_id)) byColumn.get(boardColumnOf(stateOf(chat)) as CountedColumn)!.push(chat);
    const draftItems: Item[] = baseDrafts
      .filter((d) => inProject(d.projectId))
      .map((draft) => ({ kind: "draft", key: `draft:${draft.memoryKey}:${draft.key}`, draft }));
    const groups = [
      { key: "draft", label: "下書き", tone: DRAFT_TONE, items: draftItems },
      ...COUNTED_COLUMNS.map((column) => ({
        key: column,
        label: BOARD_COLUMN_LABELS[column],
        tone: COLUMN_TONE[column],
        items: byColumn
          .get(column)!
          .sort((a, b) => b.active_at.localeCompare(a.active_at))
          .map((chat): Item => ({ kind: "chat", key: `chat:${chat.id}`, chat })),
      })),
    ].filter((g) => g.items.length > 0);
    return { groups, items: groups.flatMap((g) => g.items), total: baseChats.length + baseDrafts.length, options, selected };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- matches は selected だけで決まる
  }, [chats, drafts, query, stateOf, projects, projectName, projectsById, tagFilter.selected, project, showArchived]);
  const archivedCount = useMemo(() => projects.filter((p) => p.archived_at && (!tagFilter.active || tagFilter.matches(p))).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps -- matches は selected だけで決まる
    [projects, tagFilter.selected]);

  function go(item: Item | undefined) {
    if (!item) return;
    dialog.close();
    if (item.kind === "draft") openDraft(item.draft);
    else openChat(item.chat.project_id, item.chat.id);
  }
  const nav = useListNavigation(items, go);
  useEffect(() => nav.setIndex(0), [query, selected, showArchived]);
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
          placeholder="下書き・作業中・回答待ち・未読のチャットを絞り込む"
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
      <ul className="palette-list" role="listbox">
        {items.length === 0 && <li className="palette-empty">{query.trim() ? "見つかりません" : selected !== "all" ? "このプロジェクトに作業中・待ちのチャットはありません" : tagFilter.active ? "タグで絞り込んだプロジェクトに、作業中・待ちのチャットはありません" : "作業中・待ちのチャットはありません"}</li>}
        {groups.map((g) => (
          <Fragment key={g.key}>
            <li className="palette-group" role="presentation">
              <StatusDot color={g.tone} />
              {g.label}
              <span className="muted">{g.items.length}</span>
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
