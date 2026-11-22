import { Bot } from "lucide-react";
import { useMemo } from "react";
import type { Chat } from "@shared/chat/types";
import type { ModelOption } from "@shared/ai/types";
import { EFFORT_LABELS, type EffortLevel } from "@shared/settings/types";
import type { SubagentEntry } from "@shared/chat/subagents";
import { subagentState, type SubagentState } from "@shared/chat/subagentState";
import { confirm } from "@/foundation/ui/kit/ask";
import { formatTokens } from "@/foundation/ui/lib/format";
import { useSetting } from "@/foundation/ui/hooks/useSetting";
import { TICK_ACTIVITY, useTicker } from "@/foundation/ui/hooks/useTicker";
import { storage } from "./storage";
import { SUBAGENT_OPEN_IN } from "@/foundation/ui/storage/storageKeys";
import { modelDisplayName } from "@/features/ai/ui/options/models";
import { SubagentStatusText } from "./SubagentStatusText";
import { activityOf, activityText, stalledAgents } from "@/features/chat/ui/state/stall";
import { SubagentActions } from "./SubagentActions";
import { ClaudeMark } from "@/features/ai/ui/ClaudeMark";
import { usePopover } from "@/foundation/ui/kit/Popover";
import { AgentListChip, placesOf, summaryState, usePlaceCaps, useSubagentNav, type AgentListRow, type OpenPlace } from "@/features/chat/ui";
import { flattenTree, subagentTree } from "@/features/subagents/ui/model/subagentTree";
import { agentHues } from "@/features/subagents/ui/model/agentHues";
import { useSubagentsView } from "./subagentsContext";

/**
 * チャット欄の上の「サブエージェント N 件」（流れの中のカードの目次）。押すと一覧が開き（入れ子は親のすぐ下に字下げして並べる）、
 * 行を押すと、そのサブエージェントを設定の開き方で開く（流れの中 = カードへ移って開く。入れ子なら外側のカードも開く / 右の欄 = 右の欄にその画面を開く /
 * 別ウィンドウ）。行の右のボタンで、設定によらずその場所に開ける。一覧の上で、行を押したときの開き方（設定）を変えられる
 */
export function SubagentChip({ entries, chat, busy, models }: { entries: SubagentEntry[]; chat: Chat; busy: boolean; models: ModelOption[] }) {
  const popover = usePopover();
  const nav = useSubagentNav();
  // 開ける場所（右の欄はパネルの中のチャットだけ、別ウィンドウは Mac のアプリだけ）と、行を押したときの既定（設定）
  const places = placesOf(usePlaceCaps(), { inline: true });
  const [openIn, setOpenIn] = useSetting(SUBAGENT_OPEN_IN);
  /** 行を押した: place がなければ設定の開き方（流れの中のカード / 右の欄 / 別ウィンドウ）、あれば設定によらずその場所に開く */
  const openRow = (key: string, place?: OpenPlace) => {
    if (place === undefined) nav.open(key);
    else if (place === "window") nav.openWindow(key);
    else if (place === "side") nav.openSide(key);
    else nav.reveal(key);
  };
  // 最後の動きの表示を進める（開いている間だけ）
  useTicker(popover.open ? TICK_ACTIVITY : null);
  // アーカイブしたサブエージェント（チャットごとに覚える。一覧と件数から外す）
  const [archivedKeys, saveArchived] = useSetting(storage.settings.archived(chat.id));
  const archived = useMemo(() => new Set(archivedKeys), [archivedKeys]);
  // 色はカード・動きと同じ（隠したものも含めた一覧全体の、起動した順）
  const hues = useMemo(() => agentHues(entries), [entries]);
  // 回答待ちの依頼を出しているサブエージェント（hook なので早期 return より前に呼ぶ）
  const waiting = useSubagentsView()?.waiting;

  if (entries.length === 0) return null;
  // 新しいものを上に（入れ子は親のすぐ下に、起動した順で）
  const visible = entries.filter((s) => !archived.has(s.key)).reverse();
  // 状態（チャットと同じ 5 つと細かい様子。印・数はすべてこれから決める）
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

  // アーカイブ・戻すは、どこから押しても必ず確かめる（チャットのアーカイブと同じ）
  const archive = async (keys: string[]) => {
    const ok = await confirm({
      title: keys.length === 1 ? "このサブエージェントをアーカイブしますか？" : `完了した ${keys.length} 件のサブエージェントをアーカイブしますか？`,
      message: "一覧から隠れます。いちばん下の「アーカイブ済み」を開くと出し、戻せます。",
      confirmLabel: "アーカイブ",
    });
    if (ok) saveArchived([...new Set([...archived, ...keys])]);
  };
  const restore = async (key: string) => {
    const ok = await confirm({ title: "このサブエージェントを一覧に戻しますか？", message: "アーカイブから戻し、一覧に、また出るようになります。", confirmLabel: "戻す" });
    if (!ok) return;
    saveArchived(archivedKeys.filter((k) => k !== key));
  };

  const rowOf = (s: SubagentEntry, isArchived: boolean, depth = 0): AgentListRow => {
    const meta = [
      s.subagentType ?? "general-purpose",
      modelDisplayName(models, s.model ?? chat.model),
      s.model ? null : chat.effort ? EFFORT_LABELS[chat.effort as EffortLevel] : null,
      s.tokens !== undefined ? `${formatTokens(s.tokens)} tokens` : null,
    ].filter(Boolean);
    return {
      key: s.key,
      name: s.description,
      icon: <ClaudeMark size={16} />,
      spinning: s.status === "running",
      title: (
        <>
          <span className="agent-dot" aria-hidden />
          {s.description}
        </>
      ),
      meta: (
        <>
          {meta.join(" · ")}
          <SubagentStatusText entry={s} prefix=" · " />
          {s.status === "running" && s.lastTool && <span> · {s.lastTool}</span>}
          {s.status === "running" && <ActivityNote entry={s} />}
        </>
      ),
      below: (
        <SubagentActions
          chatId={chat.id}
          entry={s}
          busy={busy}
          onOpen={(key) => {
            if (entries.some((x) => x.key === key)) {
              popover.close();
              openRow(key);
            }
          }}
        />
      ),
      depth,
      hue: hues.get(s.key) ?? 0,
      archived: isArchived,
      canArchive: s.status !== "running",
    };
  };

  return (
    <AgentListChip
      noun="サブエージェント"
      icon={Bot}
      popover={popover}
      shown={visible.length}
      archivedCount={entries.length - visible.length}
      mark={summaryState(states.map((st) => st.state))}
      details={
        <>
          {needsInput > 0 && <span className="chip-needs-input chip-detail"> · {needsInput} 件回答待ち</span>}
          {running > 0 && <span className="chip-running chip-detail"> · {running} 件作業中</span>}
          {stalled > 0 && <span className="chip-network chip-detail"> · {stalled} 件動きなし</span>}
          {failed > 0 && <span className="chip-failed chip-detail"> · {failed} 件失敗</span>}
          {network > 0 && <span className="chip-network chip-detail"> · {network} 件通信で中断</span>}
          {awaiting > 0 && <span className="chip-awaiting chip-detail"> · {awaiting} 件受け取り待ち</span>}
          {undelivered > 0 && <span className="chip-network chip-detail"> · {undelivered} 件届かず</span>}
        </>
      }
      // 一覧の行（木・アーカイブ済み・完了したもの）は開いているときだけ作る
      list={() => ({
        rows: flattenTree(subagentTree(entries.filter((s) => !archived.has(s.key)))).map((r) => rowOf(r.entry, false, r.depth)),
        archived: entries
          .filter((s) => archived.has(s.key))
          .reverse()
          .map((s) => rowOf(s, true)),
        finished: visible.filter((s) => s.status !== "running").map((s) => s.key),
      })}
      places={places}
      openIn={openIn}
      onOpenIn={setOpenIn}
      onOpen={openRow}
      onArchive={(keys) => void archive(keys)}
      onRestore={(key) => void restore(key)}
      foldKey="subagents"
    />
  );
}

/** 実行中のサブエージェントの動きの様子（しばらく静か: 最後の動き / 長く動きがない: 注意の色）。動いていれば何も出さない */
export function ActivityNote({ entry }: { entry: SubagentEntry }) {
  const activity = activityOf(entry.lastActivityAt);
  const text = activityText(activity, entry.pendingTool);
  if (!text) return null;
  return <span className={activity.level === "stalled" ? "activity-stalled" : undefined}> · {text}</span>;
}
