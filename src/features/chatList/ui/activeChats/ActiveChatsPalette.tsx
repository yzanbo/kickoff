import { Activity } from "lucide-react";
import { Fragment, useEffect, useMemo, useState, type KeyboardEvent } from "react";
import { useChatStates } from "@/features/chat/ui/state/chatStates";
import { chatTitle } from "@/features/chat/ui/chatTitle";
import { openChat } from "@/features/chat/ui";
import { useRovingList } from "@/foundation/ui/kit/list/useRovingList";
import { useModalDialog } from "@/foundation/ui/hooks/useModalDialog";
import { useSetting } from "@/foundation/ui/hooks/useSetting";
import { useProjects } from "@/features/projects/ui/stores/projects";
import { useVisibleProjects } from "@/features/projects/ui/useVisibleProjects";
import { TagFilterNotice } from "@/features/projects/ui/TagFilterNotice";
import { relativeTime } from "@/foundation/ui/lib/time";
import { draftTitleOf } from "@/features/composer/ui";
import { ToneChip } from "@/foundation/ui/kit/ToneChip";
import { ChatStateMark } from "@/features/chat/ui";
import { bucketMark } from "@/features/chatList/ui/StateChip";
import { PaletteChatChips, PaletteProjectMark } from "@/features/chatList/ui/PaletteChatParts";
import { ChildDepthMark } from "@/features/childChats/ui/ChildDepthMark";
import { hiddenItemsOf, toggleHiddenItem } from "@/foundation/ui/lib/hiddenItems";
import { paletteSettings } from "@/features/palette/ui";
import { cycleProjectFilter, PaletteProjectFilter, type ProjectFilterValue } from "./PaletteProjectFilter";
import { ACTIVE_LOOKS, PaletteStateFilter } from "./PaletteStateFilter";
import { ACTIVE_STATES, activeChatGroups, type ActiveDraft, type ActiveGroup, type ActiveItem, type ActiveState } from "./activeChatGroups";
import { useAllProjectChats } from "./useAllWaiting";


/**
 * ⌘⇧A: 作業中・回答待ち・未読のチャットを、すべてのプロジェクトから状態ごとに並べる（⌘K と同じ形。子チャットも並べ、押すと設定の開き方で開く）。
 * 送る前の新しいチャット（下書き。サイドバー・ボードの「下書き」と同じもの）も、いちばん上に並べる。
 * 名前・プロジェクト名で絞り込め、↑↓・Enter で開く。開いている間もチャットの状態の変化に追いつく。
 * 入力欄の下の行で、プロジェクトでも絞り込める（すべて / プロジェクトごと。Tab / Shift+Tab でも切り替え。⌘⇧A で開くたびに「すべて」から。
 * プロジェクトのボタン・右クリックから開いたときは initialProject で絞り込んだところから）。
 * アーカイブ済みのプロジェクトのチャットは、行の右端の切り替えで出す（初めは隠す。覚えておく）。
 * その下の行で、並べる状態（下書き・作業中・回答待ち・未読）を選べる（いくつでも。1 つは残す。覚えておく。PaletteStateFilter）。
 * 下書きとその開き方は、下書きのタブを持つ chatPanel が渡す（ActiveChatsDialog）
 */
export function ActiveChatsPalette<D extends ActiveDraft>({
  initialProject,
  drafts,
  openDraft,
  onClose,
}: {
  initialProject?: number;
  drafts: readonly D[];
  openDraft: (draft: D) => void;
  onClose: () => void;
}) {
  const { projectName } = useProjects();
  // 出すプロジェクト: サイドバーと同じく、しまったものを除いた並び（サイドバーの「タグ」で絞り込んでいれば、合うものだけ）。
  // アーカイブ済みのプロジェクトは、行の右端の切り替えで出したときだけ後ろに足す
  const { visible, archived, tagFilter } = useVisibleProjects();
  const { pending } = useChatStates();
  const [query, setQuery] = useState("");
  // 出せるプロジェクトのチャット（子チャットも入れる。開いている間も、状態の変化・削除に追いつく。要対応の数と同じ範囲）
  const chats = useAllProjectChats();
  const { ref: dialogRef, ...dialog } = useModalDialog();
  const [project, setProject] = useState<ProjectFilterValue>(initialProject ?? "all");
  const [showArchived, setShowArchived] = useSetting(paletteSettings.activeShowArchivedProjects);
  // 並べる状態（隠したものだけを覚える。すべて隠した値が残っていても、すべて出す）
  const [hiddenStates, setHiddenStates] = useSetting(paletteSettings.activeHiddenStates);
  const shownStates = useMemo(() => {
    const hidden = hiddenItemsOf(ACTIVE_STATES, hiddenStates);
    return new Set<ActiveState>(hidden.size === ACTIVE_STATES.length ? ACTIVE_STATES : ACTIVE_STATES.filter((s) => !hidden.has(s)));
  }, [hiddenStates]);
  const toggleState = (state: ActiveState) => {
    // 最後の 1 つは外さない
    if (shownStates.has(state) && shownStates.size === 1) return;
    setHiddenStates(toggleHiddenItem(ACTIVE_STATES, hiddenStates, state));
  };

  const { groups, items, total, options, selected, stateCounts } = activeChatGroups({
    chats,
    drafts,
    query,
    projects: showArchived ? [...visible, ...archived] : visible,
    projectName,
    project,
    shownStates,
    pending,
  });
  const archivedCount = archived.length;

  function go(item: ActiveItem<D> | undefined) {
    if (!item) return;
    dialog.close();
    if (item.kind === "draft") openDraft(item.draft);
    else openChat(item.chat);
  }
  const nav = useRovingList({ mode: "activeDescendant", keys: items, onPick: go });
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
    dialogRef.current?.querySelector(".palette-item.active")?.scrollIntoView({ block: "nearest" });
  }, [nav.index, dialogRef]);

  return (
    <dialog ref={dialogRef} className="palette floating" aria-label="作業中・待ちのチャット" onClose={onClose} {...dialog.backdropProps}>
      <div className="palette-input bar">
        <Activity size={16} className="muted" aria-hidden />
        <input
          autoFocus
          value={query}
          placeholder={`${ACTIVE_STATES.filter((s) => shownStates.has(s))
            .map((s) => ACTIVE_LOOKS[s].label)
            .join("・")}のチャットを絞り込む`}
          aria-label="作業中・待ちのチャットを絞り込む"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          aria-activedescendant={nav.activeId}
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
              {/* 見出しの札の印はサイドバーの行と同じ状態の印（作業中は回るリング。作業中のまま未読があれば緑の点。下書きは印なし） */}
              <GroupChip group={g} />
            </li>
            {g.items.map((item) => {
              const i = items.indexOf(item);
              return (
                <li key={item.key} role="option" {...nav.optionProps(i)}>
                  <button
                    className={`palette-item ${i === nav.index ? "active" : ""}`}
                    onMouseEnter={() => nav.setIndex(i)}
                    onClick={() => go(item)}
                  >
                    {item.kind === "draft" ? (
                      <>
                        {/* 状態の印の場所をそろえる（下書きは AI が何もしていないので印なし） */}
                        <span className="status-slot" aria-hidden />
                        <span className="palette-label">{draftTitleOf(item.draft)}</span>
                        {/* 「下書き」のまとまりの見出しの下に並ぶので、プロジェクト名だけを添える */}
                        <span className="palette-hint">
                          <PaletteProjectMark projectId={item.draft.projectId} />
                          <span className="palette-hint-text">{projectName(item.draft.projectId)}</span>
                        </span>
                      </>
                    ) : (
                      <>
                        {/* サイドバーの行と同じ状態の印（見出しの札の印の真下） */}
                        <ChatStateMark chat={item.chat} />
                        {/* 子チャットも親の外に 1 行で並ぶので、深さの札（「子」「孫」）を付ける */}
                        {item.chat.parent_chat_id !== null && <ChildDepthMark chat={item.chat} />}
                        <span className="palette-label">{chatTitle(item.chat.title)}</span>
                        <PaletteChatChips chat={item.chat} />
                        <span className="palette-hint">
                          <PaletteProjectMark projectId={item.chat.project_id} />
                          <span className="palette-hint-text">
                            {projectName(item.chat.project_id)} · {relativeTime(item.chat.active_at, { style: "short" })}
                          </span>
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

/** まとまりの見出しの札（作業中・回答待ち・未読はサイドバーの行と同じ状態の印 = bucketMark、下書きは点） */
function GroupChip({ group }: { group: ActiveGroup }) {
  const chats = group.items.flatMap((item) => (item.kind === "chat" ? [item.chat] : []));
  const mark = group.section ? bucketMark(group.section, chats) : undefined;
  return <ToneChip state={group.tone} dot={!mark} icon={mark} label={group.label} count={group.items.length} />;
}
