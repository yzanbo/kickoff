// このウィンドウで描いているチャットの画面の登録簿（1 つだけ）: チャット・タブの置き場所で引く・見えているか・最後に押した画面・別ウィンドウからの知らせ
import { useEffect, useRef, type RefObject } from "react";
import { onWindowMessage } from "@/foundation/ui/navigation/windowBus";
import type { ActivityNav, SubagentNav, TimelineNav } from "./ports";

/** 描いているチャットの画面（ChatScreen が描いている間だけ登録する） */
export interface ShownScreen {
  chatId: number;
  /** パネルのタブの置き場所（タブの中の画面だけ） */
  slot?: string;
  root: RefObject<HTMLElement | null>;
  /** 画面の操作の口（チャットごとに 1 回だけ作ったもの） */
  timeline: TimelineNav;
  subagents: SubagentNav;
  activity: ActivityNav;
  /** 画面のあるタブを表に出す（パネルのタブの中の画面だけ） */
  bringToFront?: () => void;
}

const isShown = (s: ShownScreen) => {
  const el = s.root.current;
  return Boolean(el?.isConnected && el.offsetParent !== null);
};

/** 登録簿を作る（アプリではこのモジュールの 1 つだけ。テストは偽の要素で作る） */
export function createChatScreens() {
  /** 描いている画面（同じチャットを 2 つの欄で開いていることもある） */
  const screens = new Set<ShownScreen>();
  /** 最後に押したチャットの画面（チャットの外を押したら undefined。流れの文を押すだけではピントが移らないため） */
  let lastPressed: ShownScreen | undefined;
  /** 最後に押した要素（右の欄の中を押したかを見る） */
  let lastTarget: Element | null = null;
  /** そのチャットの画面（見えているものを先に。同じチャットを 2 つの欄で開いていても、知らせを 1 回だけ当てる） */
  const screenOfChat = (chatId: number): ShownScreen | undefined => {
    const list = [...screens].filter((s) => s.chatId === chatId);
    return list.find(isShown) ?? list[0];
  };
  return {
    register(screen: ShownScreen): () => void {
      screens.add(screen);
      return () => {
        screens.delete(screen);
        if (lastPressed === screen) lastPressed = undefined;
      };
    },
    screenOfChat,
    screenAt: (slot: string): ShownScreen | undefined => [...screens].find((s) => s.slot === slot),
    isScreenShown(chatId: number): boolean {
      const s = screenOfChat(chatId);
      return s !== undefined && isShown(s);
    },
    shownChatIds: (): number[] => [...new Set([...screens].filter(isShown).map((s) => s.chatId))],
    /** 押した（入れ子なら、いちばん内側のチャットの画面を最後に押した画面にする） */
    pressed(target: Node | null) {
      lastTarget = target?.nodeType === 1 ? (target as Element) : null;
      const hits = target ? [...screens].filter((s) => s.root.current?.contains(target)) : [];
      lastPressed = hits.find((s) => !hits.some((o) => o !== s && s.root.current!.contains(o.root.current))) ?? undefined;
    },
    lastPressedScreen: (): ShownScreen | undefined => lastPressed,
    lastPressedElement: (): Element | null => lastTarget,
    /** 移る・動きを開く先の画面（隠れていれば、先にそのタブを表に出す。隠れた画面の中で移っても、利用者には見えない） */
    front(chatId: number): ShownScreen | undefined {
      const s = screenOfChat(chatId);
      if (s && !isShown(s)) s.bringToFront?.();
      return s;
    },
  };
}

const registry = createChatScreens();
let started = false;

/** このウィンドウで描いているそのチャットの画面（見えているものを先に。なければ undefined） */
export const screenOfChat = registry.screenOfChat;
/** そのタブで描いているチャットの画面（描いていなければ undefined） */
export const screenAt = registry.screenAt;
/** そのチャットの画面が、このウィンドウで見えているか */
export const isScreenShown = registry.isScreenShown;
/** このウィンドウで見えているチャットの画面のチャットの ID（右の欄の子チャットも含む） */
export const shownChatIds = registry.shownChatIds;
/** 最後に押したチャットの画面（入れ子なら、いちばん内側の画面） */
export const lastPressedScreen = registry.lastPressedScreen;
/** 最後に押した要素（右の欄の検索が、ピントがないときにどの欄で受け取るかを決める） */
export const lastPressedElement = registry.lastPressedElement;

/** 押した画面の見張りと、別ウィンドウ（変更・サブエージェント）からの知らせを受け始める（最初の画面で 1 回だけ） */
function start() {
  if (started) return;
  started = true;
  window.addEventListener("pointerdown", (e) => registry.pressed(e.target instanceof Node ? e.target : null), true);
  onWindowMessage("reveal", ({ chatId, eventId, agent }) => registry.front(chatId)?.activity.revealInConversation(eventId, agent));
  onWindowMessage("showActivity", ({ chatId, agent }) => registry.front(chatId)?.activity.focus(agent));
}

/** チャットの画面を登録する（描いている間だけ。返り値で外す） */
function registerScreen(screen: ShownScreen): () => void {
  start();
  return registry.register(screen);
}

/** 登録する画面の口（チャットごとに 1 回だけ作ったもの） */
export interface ScreenPorts {
  root: RefObject<HTMLDivElement | null>;
  timeline: TimelineNav;
  subagents: SubagentNav;
  activity: ActivityNav;
}

/** チャットの画面を描いている間だけ登録する（ChatScreen が呼ぶ。表に出す操作が変わっても登録し直さない = 最後に押した画面のまま） */
export function useRegisterScreen(chatId: number, ports: ScreenPorts, slot: string | undefined, bringToFront: (() => void) | undefined) {
  const current = useRef<ShownScreen | null>(null);
  useEffect(() => {
    const screen: ShownScreen = { chatId, slot, ...ports };
    current.current = screen;
    return registerScreen(screen);
  }, [chatId, ports, slot]);
  useEffect(() => {
    if (current.current) current.current.bringToFront = bringToFront;
  }, [chatId, ports, slot, bringToFront]);
}
