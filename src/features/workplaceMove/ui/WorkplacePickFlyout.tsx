import { Check, ChevronRight, GitBranch } from "lucide-react";
import { useEffect, useState } from "react";
import type { Chat } from "@shared/chat/types";
import { workplaceMoveApi } from "./api";
import { MenuFlyout, useSubmenu } from "@/foundation/ui/kit/MenuFlyout";
import { useWorktrees } from "@/foundation/ui/workplace/worktreesStore";
import { useWorkplaceChoices } from "./WorkplaceMoveChip";
import { moveChatWorkplace, workplaceMoveBlock } from "./moveWorkplace";

/**
 * チャットの右クリックの「作業場所を変更」（「プロジェクトを変更」の隣。子チャットは移らない）。乗せる・押す・→ で横に移す先の作業場所の一覧を開く。
 * ワークツリーの一覧がある = Git のプロジェクトだけに出し、作業中・実行環境を整えるチャットは押せない（理由を説明に）
 */
export function WorkplaceMoveItem({ chat, onDone }: { chat: Chat; onDone: () => void }) {
  const relocating = useSubmenu();
  const canRelocate = (useWorktrees(chat.project_id)?.length ?? 0) > 0;
  const block = workplaceMoveBlock(chat);
  return (
    <>
      {canRelocate && (
        <button {...relocating.trigger} disabled={block !== null} data-tip={block ?? undefined}>
          <GitBranch size={14} /> 作業場所を変更
          <ChevronRight size={14} className="menu-submenu-chevron" aria-hidden />
        </button>
      )}
      {relocating.anchor && <WorkplacePickFlyout anchor={relocating.anchor} chat={chat} onDone={onDone} onBack={relocating.back} />}
    </>
  );
}

/**
 * 「作業場所を変更」の横に開く、移す先の一覧: 本体・いまあるワークツリー・新しいワークツリー…。
 * いまの作業場所にチェック、片付けを予約したワークツリーは押せない（理由を説明に）。選ぶと確かめてから移す（moveChatWorkplace）
 */
function WorkplacePickFlyout({ anchor, chat, onDone, onBack }: { anchor: HTMLElement; chat: Chat; onDone: () => void; onBack: () => void }) {
  const [reserved, setReserved] = useState<string[]>([]);
  useEffect(() => {
    let alive = true;
    workplaceMoveApi("GET /api/chats/:chatId/workplace", { params: { chatId: chat.id } }).then(
      (c) => alive && setReserved(c.reserved),
      () => {},
    );
    return () => {
      alive = false;
    };
  }, [chat.id]);
  const choices = useWorkplaceChoices(chat, reserved);
  const pick = (value: string) => {
    onDone();
    void choices.resolve(value).then((picked) => {
      if (picked) void moveChatWorkplace(chat, picked.place, picked.label);
    });
  };
  return (
    <MenuFlyout anchor={anchor} label="移す先の作業場所" className="project-pick" onBack={onBack}>
      {choices.values.map((v) => {
        const reason = choices.disabled[v];
        return (
          <button key={v || "main"} role="menuitemradio" aria-checked={v === choices.current} disabled={reason !== undefined && v !== choices.current} data-tip={reason} onClick={() => (v === choices.current ? onBack() : pick(v))}>
            <span className="project-switch-item">{choices.labels[v]}</span>
            {v === choices.current && <Check size={14} className="project-pick-check" aria-hidden />}
          </button>
        );
      })}
    </MenuFlyout>
  );
}
