// サブエージェントを開く口（SubagentNav）の実装。チャットの画面がチャットごとに 1 回だけ作る
import { createCell } from "@/foundation/ui/store";
import { readSetting } from "@/foundation/ui/storage";
import { canPopout, openPopout } from "@/foundation/ui/navigation/popout";
import { SUBAGENT_OPEN_IN } from "@/foundation/ui/storage/storageKeys";
import { panelActions, panelKey } from "@/features/panel/ui";
import { setOpen, timelineView, type SubagentNav } from "@/features/chat/ui";
import { chatSubagents, pathOf } from "@/features/subagents/ui";
import { jumpToEvent } from "@/features/conversation/ui/timeline/jumpToEvent";

export interface SubagentNavDeps {
  chatId: number;
  /** 右の欄（サブエージェントの欄）を置けるか（パネルの中のチャット） */
  canOpenSide: boolean;
  /** 流れの一番下への付いていきをやめる（書いている「伝える」の欄が流れていかないように） */
  release: () => void;
  /** カードへ移って開く（またがる操作。screenActions.ts が組む） */
  reveal: SubagentNav["reveal"];
}

/** 右の欄の中のサブエージェントの画面（data-agent-screen）の、スクロールする欄 */
const sideScroller = (chatId: number, key: string) =>
  document.querySelector<HTMLElement>(`[data-agent-screen="${chatId}:${key}"] .subagent-screen-scroll`);

/** サブエージェントの別ウィンドウを開く（開いたときの名前は、押したときの一覧から引く） */
export function openSubagentWindow(chatId: number, key: string) {
  const entry = chatSubagents.read(chatId).tree.byKey.get(key);
  openPopout({ kind: "subagent", chatId, agentKey: key }, `${entry?.description ?? "サブエージェント"} — サブエージェント`);
}

export function createSubagentNav({ chatId, canOpenSide, release, reveal }: SubagentNavDeps): SubagentNav {
  const tree = () => chatSubagents.read(chatId).tree;
  const tellOpen = createCell<ReadonlySet<string>>(new Set());
  /** 右の欄に開いたサブエージェントの画面の中の、その記録の要素へ移る（タブの中身が描かれるまで、数フレーム待つ） */
  const jumpInSide = (key: string, eventId: number, frames = 20) => {
    const el = sideScroller(chatId, key);
    if (el && jumpToEvent(el, eventId)) return;
    if (frames > 0) requestAnimationFrame(() => jumpInSide(key, eventId, frames - 1));
  };
  const nav: SubagentNav = {
    open: (key, eventId) => {
      const place = readSetting(SUBAGENT_OPEN_IN);
      if (place === "window" && canPopout()) nav.openWindow(key);
      else if (place !== "inline" && canOpenSide) nav.openSide(key, eventId);
      else nav.reveal(key, eventId);
    },
    openWindow: (key) => {
      if (!canPopout()) return nav.openSide(key);
      openSubagentWindow(chatId, key);
    },
    openSide: (key, eventId) => {
      const entry = tree().byKey.get(key);
      if (!entry) return;
      if (!canOpenSide) return nav.reveal(key, eventId);
      // サブエージェントの中で起動したもの（入れ子）は、タブに外側からの道筋を持たせる（名前の前の「↳」と、乗せたときの道筋）
      const path = pathOf(tree(), key);
      panelActions(panelKey("agents", chatId)).openSubagent({
        chatId,
        agentKey: key,
        title: entry.description,
        ...(path.length > 1 ? { path: path.map((s) => s.description).join(" › ") } : {}),
      });
      if (eventId !== undefined) requestAnimationFrame(() => jumpInSide(key, eventId));
    },
    reveal,
    toggle: (key, open) => {
      // 開閉は流れの見え方の店（行が窓から外れて戻っても・画面を作り直しても開いたまま）
      const view = timelineView(chatId);
      setOpen(view, `sa:${key}`, open ?? !view.open.get().has(`sa:${key}`));
    },
    toggleFull: (key) => {
      const view = timelineView(chatId);
      setOpen(view, `sf:${key}`, !view.open.get().has(`sf:${key}`));
    },
    tell: (key) => {
      if (!tree().byKey.get(key)?.agentId) return;
      // 書いている間に、カードの入力欄が流れの上へ流れていかないように
      release();
      tellOpen.set(new Set([...tellOpen.get(), key]));
    },
    closeTell: (key) => {
      const next = new Set(tellOpen.get());
      if (next.delete(key)) tellOpen.set(next);
    },
    tellOpen,
    canOpenSide,
  };
  return nav;
}

