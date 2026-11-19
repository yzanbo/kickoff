import { Check } from "lucide-react";
import { useEffect, useState } from "react";
import type { Chat } from "@shared/types";
import { api } from "@/api";
import { MenuFlyout } from "@/ui/MenuFlyout";
import { useWorkplaceChoices } from "./WorkplaceMoveChip";
import { moveChatWorkplace } from "./moveWorkplace";

/**
 * チャットの右クリックの「作業場所を変更」の横に開く、移す先の一覧: 本体・いまあるワークツリー・新しいワークツリー…。
 * いまの作業場所にチェック、片付けを予約したワークツリーは押せない（理由を説明に）。選ぶと確かめてから移す（moveChatWorkplace）
 */
export function WorkplacePickFlyout({ anchor, chat, onDone, onBack }: { anchor: HTMLElement; chat: Chat; onDone: () => void; onBack: () => void }) {
  const [reserved, setReserved] = useState<string[]>([]);
  useEffect(() => {
    let alive = true;
    api.workplaceCheck(chat.id).then(
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
