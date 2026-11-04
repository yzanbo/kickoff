import { Archive, ArchiveRestore, ChevronUp } from "lucide-react";
import { useMemo, useState } from "react";
import { EFFORT_LABELS, type EffortLevel, type ModelOption, type Chat } from "@shared/types";
import type { SubagentEntry } from "@shared/chat/subagents";
import { confirmDialog } from "@/ui/dialogs";
import { formatTokens } from "@/lib/format";
import { useSetting } from "@/hooks/useSetting";
import { useTicker } from "@/hooks/useTicker";
import { subagentsArchived } from "@/lib/storageKeys";
import { modelDisplayName } from "@/features/chat/options/models";
import { showsSubagentStatus, subagentStatusClass, subagentStatusLabel, subagentStatusTitle } from "./subagentList";
import { activityOf, activityText } from "@/features/chat/status/stall";
import { SubagentActions } from "./SubagentActions";
import { ClaudeMark } from "@/ui/ClaudeMark";
import { IconButton } from "@/ui/IconButton";
import { Popover, usePopover } from "@/ui/Popover";
import { useChatPane } from "@/features/chat/pane/chatPaneContext";

/**
 * チャット欄の下の「サブエージェント N 件」。押すと一覧が開き、行を押すとそのサブエージェントの中身をパネルのタブで開く
 */
export function SubagentChip({ entries, chat, busy, models }: { entries: SubagentEntry[]; chat: Chat; busy: boolean; models: ModelOption[] }) {
  const popover = usePopover();
  const { open, setOpen } = popover;
  const pane = useChatPane();
  /** 中身を開いて、一覧を閉じる（key = 一覧の行のキー） */
  const openRow = (key: string) => {
    pane.openSubagent(key);
    setOpen(false);
  };
  // 最後の動きの表示を進める（開いている間だけ）
  useTicker(open ? 15_000 : 3_600_000);
  const [showArchived, setShowArchived] = useState(false);
  // アーカイブしたサブエージェント（チャットごとに覚える。一覧と件数から外す）
  const [archivedKeys, saveArchived] = useSetting(subagentsArchived(chat.id));
  const archived = useMemo(() => new Set(archivedKeys), [archivedKeys]);

  if (entries.length === 0) return null;
  // 新しいものを上に
  const visible = entries.filter((s) => !archived.has(s.key)).reverse();
  const hidden = entries.filter((s) => archived.has(s.key)).reverse();
  const running = visible.filter((s) => s.status === "running").length;
  // 実行中なのに長く動きがないもの（ピルにも出して、開かなくても気づけるようにする）
  const stalled = visible.filter((s) => s.status === "running" && activityOf(s.lastActivityAt).level === "stalled").length;
  // 通信の切断で止まったものは、作業の失敗と分けて数える（「再開」で続きから戻せる）
  // 親がもうやり直したものは、手を打たなくてよいので数えない
  const failed = visible.filter((s) => s.status === "failed" && !s.network && !s.supersededBy).length;
  const network = visible.filter((s) => s.network && !s.supersededBy).length;
  // 報告が親に届いたか（受け取り待ち・届いていない）。届いていないものは「報告を親に渡す」で渡し直せる
  const awaiting = visible.filter((s) => s.status === "completed" && s.delivery === "pending").length;
  const undelivered = visible.filter((s) => s.status === "completed" && s.delivery === "lost").length;
  const finished = visible.filter((s) => s.status !== "running");

  // アーカイブ・戻すは、どこから押しても必ず確かめる（チャットのアーカイブと同じ）
  const archive = async (keys: string[]) => {
    const ok = await confirmDialog({
      title: keys.length === 1 ? "このサブエージェントをアーカイブしますか？" : `完了した ${keys.length} 件のサブエージェントをアーカイブしますか？`,
      message: "一覧から隠れます。「アーカイブ済みを表示」で出し、戻せます。",
      confirmLabel: "アーカイブ",
    });
    if (ok) saveArchived([...new Set([...archived, ...keys])]);
  };
  const restore = async (key: string) => {
    const ok = await confirmDialog({ title: "このサブエージェントを一覧に戻しますか？", message: "アーカイブから戻し、一覧に、また出るようになります。", confirmLabel: "戻す" });
    if (!ok) return;
    saveArchived(archivedKeys.filter((k) => k !== key));
  };

  const renderRow = (s: SubagentEntry, isArchived: boolean) => {
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
        className={`subagent-row status-${s.status} ${isArchived ? "archived" : ""}`}
        onClick={() => openRow(s.key)}
        onKeyDown={(e) => e.key === "Enter" && openRow(s.key)}
      >
        <span className={`subagent-icon ${s.status === "running" ? "spinning" : ""}`}>
          <ClaudeMark size={16} />
        </span>
        <span className="subagent-text">
          <span className="subagent-title">{s.description}</span>
          <span className="subagent-meta">
            {meta.join(" · ")}
            {showsSubagentStatus(s) && <span className={`subagent-status ${subagentStatusClass(s)}`} title={subagentStatusTitle(s)}> · {subagentStatusLabel(s)}</span>}
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
    <div className="chip-wrap">
      <button ref={popover.anchor} type="button" className={`composer-chip ${open ? "open" : ""}`} aria-expanded={open} onClick={popover.toggle}>
        {running > 0 && (
          <span className="chip-mark">
            <ClaudeMark size={13} />
          </span>
        )}
        {visible.length > 0 ? `サブエージェント ${visible.length} 件` : `アーカイブ済みのサブエージェント ${hidden.length} 件`}
        {running > 0 && <span className="chip-running"> · {running} 件実行中</span>}
        {stalled > 0 && <span className="chip-network"> · {stalled} 件動きなし</span>}
        {failed > 0 && <span className="chip-failed"> · {failed} 件失敗</span>}
        {network > 0 && <span className="chip-network"> · {network} 件通信で中断</span>}
        {awaiting > 0 && <span className="chip-awaiting"> · {awaiting} 件受け取り待ち</span>}
        {undelivered > 0 && <span className="chip-network"> · {undelivered} 件届かず</span>}
        <ChevronUp size={13} className="chip-chevron" aria-hidden />
      </button>
      {open && (
        // アーカイブ・戻すの確かめのダイアログを押しても、一覧は閉じない
        <Popover anchor={popover.anchor} side="above" gap={8} label="サブエージェント" className="chip-popover" ignore="dialog" onClose={popover.close}>
          <button type="button" className="subagent-archive-all" disabled={finished.length === 0} onClick={() => void archive(finished.map((s) => s.key))}>
            <Archive size={15} aria-hidden />
            完了したサブエージェントをアーカイブ
            {finished.length > 0 && <span className="muted">（{finished.length} 件）</span>}
          </button>
          {visible.length === 0 && <p className="muted small subagent-empty">表示中のサブエージェントはありません</p>}
          {visible.map((s) => renderRow(s, false))}
          {hidden.length > 0 && (
            <>
              <button type="button" className="subagent-archived-toggle" onClick={() => setShowArchived(!showArchived)}>
                {showArchived ? "アーカイブ済みを隠す" : `アーカイブ済み ${hidden.length} 件を表示`}
              </button>
              {showArchived && hidden.map((s) => renderRow(s, true))}
            </>
          )}
        </Popover>
      )}
    </div>
  );
}

/** 実行中のサブエージェントの動きの様子（しばらく静か: 最後の動き / 長く動きがない: 注意の色）。動いていれば何も出さない */
export function ActivityNote({ entry }: { entry: SubagentEntry }) {
  const activity = activityOf(entry.lastActivityAt);
  const text = activityText(activity, entry.pendingTool);
  if (!text) return null;
  return <span className={activity.level === "stalled" ? "activity-stalled" : undefined}> · {text}</span>;
}
