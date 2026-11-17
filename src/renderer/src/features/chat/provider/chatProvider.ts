// チャットの AI を画面の部品に配る（メモの仕様書「0021」の Q4: その AI にない機能は押せない形にして理由を出す）。
// チャットの画面（ChatView）・送る前の新しいチャット・新しい子チャットが ChatProviderContext に AI を入れ、中の部品は useFeatureBlock で理由を読む。
// AI の状態の店（providersStore）は使い始めるたびに取り直すので、読み込みを頼むのは入れる側の 1 か所（useProviderStatus の load）だけにし、中の部品は頼まずに読む
import { createContext, useContext, useSyncExternalStore } from "react";
import type { ProviderFeature, ProviderId, ProviderStatus } from "@shared/types";
import { useProviders } from "@/stores/providers";
import { featureBlock, statusOf } from "./providerChoice";
import { nextForegroundChat, type ForegroundChat } from "./foregroundChat";

/** そのチャットの AI（入れていない所 = チャットの画面の外は Claude Code として扱い、何も止めない） */
export const ChatProviderContext = createContext<ProviderId>("claude");

/** いまの部品のチャットの AI */
export const useChatProviderId = (): ProviderId => useContext(ChatProviderContext);

/** AI の状態（入れる側が 1 回だけ読み込みを頼む。中の部品は active: false で読むだけ） */
export function useProviderStatus(id: ProviderId, { load = false }: { load?: boolean } = {}): ProviderStatus | undefined {
  return statusOf(useProviders({ active: load }).data, id);
}

/** いまの部品のチャットの AI で、その機能を使えない理由（使えるなら null） */
export function useFeatureBlock(feature: ProviderFeature): string | null {
  return featureBlock(useProviderStatus(useChatProviderId()), feature);
}

// 前に出しているチャットの AI（下の帯の使用状況。Q6 B）。見えているチャットの画面を最後に表に出した・触ったものにする
let foreground: ForegroundChat = { provider: null, key: null };
const listeners = new Set<() => void>();

/** チャットの画面が表に出た・触られたときに、その AI を前に出したものとして覚える */
export function noteForegroundProvider(id: ProviderId, key: string) {
  const next = nextForegroundChat(foreground, id, key);
  if (foreground === next) return;
  foreground = next;
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** 前に出しているチャットの AI（まだチャットを開いていなければ null） */
export const useForegroundChat = (): ForegroundChat => useSyncExternalStore(subscribe, () => foreground);
export const useForegroundProvider = (): ProviderId | null => useForegroundChat().provider;
