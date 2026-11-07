import { Archive, ArchiveRestore, Bot } from "lucide-react";
import { useMemo, type CSSProperties } from "react";
import { EFFORT_LABELS, type EffortLevel, type ModelOption, type Chat } from "@shared/types";
import type { SubagentEntry } from "@shared/chat/subagents";
import { subagentState, type SubagentState } from "@shared/chat/subagentState";
import { confirmDialog } from "@/ui/dialogs";
import { cx } from "@/lib/cx";
import { formatTokens } from "@/lib/format";
import { useSetting } from "@/hooks/useSetting";
import { useTicker } from "@/hooks/useTicker";
import { SUBAGENT_OPEN_IN, subagentsArchived } from "@/lib/storageKeys";
import { canPopout } from "@/app/popout";
import { DefaultOpenPlace, OpenPlaceButtons, type OpenPlace } from "@/features/chat/composer/OpenPlaceControls";
import { modelDisplayName } from "@/features/chat/options/models";
import { SubagentStatusText } from "./SubagentStatusText";
import { activityOf, activityText, stalledAgents } from "@/features/chat/status/stall";
import { SubagentActions } from "./SubagentActions";
import { ClaudeMark } from "@/ui/ClaudeMark";
import { ArchivedFold } from "@/ui/ArchivedFold";
import { IconButton } from "@/ui/IconButton";
import { usePopover } from "@/ui/Popover";
import { ChipWord, ComposerChip } from "@/features/chat/composer/ComposerChip";
import { useChatPane } from "@/features/chat/pane/chatPaneContext";
import { flattenTree, subagentTree } from "./subagentTree";
import { agentHues } from "./agentHues";
import { useSubagentsView } from "./subagentsContext";
import { StatusSlot } from "@/features/chat/StatusSlot";
import { summaryState } from "@/features/chat/chatState";

/**
 * チャット欄の上の「サブエージェント N 件」（流れの中のカードの目次）。押すと一覧が開き（入れ子は親のすぐ下に字下げして並べる）、
 * 行を押すと、そのサブエージェントを設定の開き方で開く（流れの中 = カードへ移って開く。入れ子なら外側のカードも開く / 右の欄 = 右の欄にその画面を開く /
 * 別ウィンドウ）。行の右のボタンで、設定によらずその場所に開ける。一覧の上で、行を押したときの開き方（設定）を変えられる
 */
export function SubagentChip({ entries, chat, busy, models }: { entries: SubagentEntry[]; chat: Chat; busy: boolean; models: ModelOption[] }) {
  const popover = usePopover();
  const { open, setOpen } = popover;
  const pane = useChatPane();
  /** 設定の開き方（流れの中のカード / 右の欄 / 別ウィンドウ）で開き、一覧を閉じる（key = 一覧の行のキー） */
  const openRow = (key: string) => {
    pane.openSubagent(key);
    setOpen(false);
  };
  // 開ける場所（右の欄はパネルの中のチャットだけ、別ウィンドウは Mac のアプリだけ）と、行を押したときの既定（設定）
  const places: OpenPlace[] = ["inline", ...(pane.canOpenSide ? (["side"] as const) : []), ...(canPopout() ? (["window"] as const) : [])];
  const [openIn, setOpenIn] = useSetting(SUBAGENT_OPEN_IN);
  /** 行のボタン: 設定によらず、その場所に開く */
  const openAt = (key: string, place: OpenPlace) => {
    if (place === "window") pane.openSubagentWindow(key);
    else if (place === "side") pane.openSubagentSide(key);
    else pane.revealSubagent(key);
    setOpen(false);
  };
  // 最後の動きの表示を進める（開いている間だけ）
  useTicker(open ? 15_000 : 3_600_000);
  // アーカイブしたサブエージェント（チャットごとに覚える。一覧と件数から外す）
  const [archivedKeys, saveArchived] = useSetting(subagentsArchived(chat.id));
  const archived = useMemo(() => new Set(archivedKeys), [archivedKeys]);
  // 色はカード・動きと同じ（隠したものも含めた一覧全体の、起動した順）
  const hues = useMemo(() => agentHues(entries), [entries]);

  if (entries.length === 0) return null;
  // 新しいものを上に（入れ子は親のすぐ下に、起動した順で）
  const visible = entries.filter((s) => !archived.has(s.key)).reverse();
  const rows = flattenTree(subagentTree(entries.filter((s) => !archived.has(s.key))));
  const hidden = entries.filter((s) => archived.has(s.key)).reverse();
  // 状態（チャットと同じ 5 つと細かい様子。印・数はすべてこれから決める）
  const waiting = useSubagentsView()?.waiting;
  const states = visible.map((s) => subagentState(s, waiting?.has(s.key)));
  const count = (match: (st: SubagentState) => boolean) => states.filter(match).length;
  const running = count((st) => st.state === "running");
  // 回答待ちの依頼（承認・質問）を出しているもの（いちばん先に見てほしい）
  const needsInput = count((st) => st.state === "needs_input");
  // 実行中なのに長く動きがないもの（ピルにも出して、開かなくても気づけるようにする）
  const stalled = stalledAgents(visible).length;
  // 通信の切断で止まったものは、作業の失敗と分けて数える（「再開」で続きから戻せる）。親がもうやり直したものは既読なので数えない
  const failed = count((st) => st.state === "failed" && (st.detail === null || st.detail === "output_limit"));
  const network = count((st) => st.detail === "network");
  // 報告が親に届いたか（受け取り待ち・届いていない）。届いていないものは「報告を親に渡す」で渡し直せる
  const awaiting = count((st) => st.detail === "awaiting");
  const undelivered = count((st) => st.detail === "undelivered");
  const finished = visible.filter((s) => s.status !== "running");

  // アーカイブ・戻すは、どこから押しても必ず確かめる（チャットのアーカイブと同じ）
  const archive = async (keys: string[]) => {
    const ok = await confirmDialog({
      title: keys.length === 1 ? "このサブエージェントをアーカイブしますか？" : `完了した ${keys.length} 件のサブエージェントをアーカイブしますか？`,
      message: "一覧から隠れます。いちばん下の「アーカイブ済み」を開くと出し、戻せます。",
      confirmLabel: "アーカイブ",
    });
    if (ok) saveArchived([...new Set([...archived, ...keys])]);
  };
  const restore = async (key: string) => {
    const ok = await confirmDialog({ title: "このサブエージェントを一覧に戻しますか？", message: "アーカイブから戻し、一覧に、また出るようになります。", confirmLabel: "戻す" });
    if (!ok) return;
    saveArchived(archivedKeys.filter((k) => k !== key));
  };

  const renderRow = (s: SubagentEntry, isArchived: boolean, depth = 0) => {
    const meta = [
      s.subagentType ?? "general-purpose",
      modelDisplayName(models, s.model ?? chat.model),
      s.model ? null : chat.effort ? EFFORT_LABELS[chat.effort as EffortLevel] : null,
      s.tokens !== undefined ? `${formatTokens(s.tokens)} tokens` : null,
    ].filter(Boolean);
    return (
      <div
        key={s.key}
        role="button"
        tabIndex={0}
        className={cx("subagent-row", isArchived && "archived")}
        style={{ ...(depth > 0 ? { "--depth": Math.min(depth, 4) } : {}), "--agent-hue": `${hues.get(s.key) ?? 0}` } as CSSProperties}
        onClick={() => openRow(s.key)}
        onKeyDown={(e) => e.key === "Enter" && openRow(s.key)}
      >
        <span className={`subagent-icon ${s.status === "running" ? "spinning" : ""}`}>
          <ClaudeMark size={16} />
        </span>
        <span className="subagent-text">
          <span className="subagent-title">
            <span className="agent-dot" aria-hidden />
            {s.description}
          </span>
          <span className="subagent-meta">
            {meta.join(" · ")}
            <SubagentStatusText entry={s} prefix=" · " />
            {s.status === "running" && s.lastTool && <span> · {s.lastTool}</span>}
            {s.status === "running" && <ActivityNote entry={s} />}
          </span>
          {!isArchived && (
            <SubagentActions
              chatId={chat.id}
              entry={s}
              busy={busy}
              onOpen={(key) => {
                if (entries.some((x) => x.key === key)) openRow(key);
              }}
            />
          )}
        </span>
        <OpenPlaceButtons places={places} onOpen={(place) => openAt(s.key, place)} />
        {isArchived ? (
          <IconButton
            icon={ArchiveRestore}
            label={`${s.description} を一覧に戻す`}
            title="一覧に戻す"
            className="subagent-row-action"
            type="button"
            onClick={(e) => (e.stopPropagation(), void restore(s.key))}
          />
        ) : (
          s.status !== "running" && (
            <IconButton
              icon={Archive}
              label={`${s.description} をアーカイブ`}
              title="アーカイブ"
              className="subagent-row-action"
              type="button"
              onClick={(e) => (e.stopPropagation(), void archive([s.key]))}
            />
          )
        )}
      </div>
    );
  };

  return (
    // アーカイブ・戻すの確かめのダイアログを押しても、一覧は閉じない
    <ComposerChip
      popover={popover}
      chip={
        <>
          {/* 左の印: 作業中のものがあれば回るリング、手を打つもの（失敗・通信で中断・届かず）があれば赤の点、ほかは薄い点（すべてアーカイブ済みなら出さない） */}
          {visible.length > 0 && <StatusSlot {...summaryState(states.map((st) => st.state))} />}
          {/* 狭い所でアイコンと数だけにするときの、サブエージェントの印（ふだんは出さない） */}
          <Bot size={14} className="chip-icon chip-short-icon" aria-hidden />
          <span>
            <ChipWord>{visible.length > 0 ? "サブエージェント " : "アーカイブ済みのサブエージェント "}</ChipWord>
            {visible.length > 0 ? visible.length : hidden.length}
            <ChipWord> 件</ChipWord>
          </span>
          {needsInput > 0 && <span className="chip-needs-input chip-detail"> · {needsInput} 件回答待ち</span>}
          {running > 0 && <span className="chip-running chip-detail"> · {running} 件作業中</span>}
          {stalled > 0 && <span className="chip-network chip-detail"> · {stalled} 件動きなし</span>}
          {failed > 0 && <span className="chip-failed chip-detail"> · {failed} 件失敗</span>}
          {network > 0 && <span className="chip-network chip-detail"> · {network} 件通信で中断</span>}
          {awaiting > 0 && <span className="chip-awaiting chip-detail"> · {awaiting} 件受け取り待ち</span>}
          {undelivered > 0 && <span className="chip-network chip-detail"> · {undelivered} 件届かず</span>}
        </>
      }
      label="サブエージェント"
      ignore="dialog"
    >
      {places.length > 1 && <DefaultOpenPlace places={places} value={places.includes(openIn) ? openIn : places[0]} onChange={setOpenIn} />}
      <button type="button" className="subagent-archive-all" disabled={finished.length === 0} onClick={() => void archive(finished.map((s) => s.key))}>
        <Archive size={15} aria-hidden />
        完了したサブエージェントをアーカイブ
        {finished.length > 0 && <span className="muted">（{finished.length} 件）</span>}
      </button>
      {visible.length === 0 && <p className="muted small subagent-empty">表示中のサブエージェントはありません</p>}
      {rows.map((r) => renderRow(r.entry, false, r.depth))}
      <ArchivedFold place="composer" foldKey="subagents" count={hidden.length} className="composer-archived">
        {hidden.map((s) => renderRow(s, true))}
      </ArchivedFold>
    </ComposerChip>
  );
}

/** 実行中のサブエージェントの動きの様子（しばらく静か: 最後の動き / 長く動きがない: 注意の色）。動いていれば何も出さない */
export function ActivityNote({ entry }: { entry: SubagentEntry }) {
  const activity = activityOf(entry.lastActivityAt);
  const text = activityText(activity, entry.pendingTool);
  if (!text) return null;
  return <span className={activity.level === "stalled" ? "activity-stalled" : undefined}> · {text}</span>;
}
