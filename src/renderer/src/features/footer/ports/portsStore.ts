// ポートを使っているプロセスの一覧（全プロジェクト）と、下の帯のボタンの点。
// 下の帯が出たとき（起動したとき）に 1 回調べ、そのあとはコアの知らせ（窓を開いた・↻・止めた・チャットの実行が終わったときに調べた一覧）で入れ替える
import type { BusEvent, PortProcess } from "@shared/types";
import { api } from "@/api";
import { createStore } from "@/stores/createStore";
import { useStore } from "@/stores/useStore";

export interface PortsState {
  processes: PortProcess[];
  /** チャットの実行の間に新しく現れたものがある（窓を開いたら消す） */
  dot: boolean;
}

/** 知らせで直す（新しく現れたものがあれば点を付ける。点は窓を開くまで残す） */
export function reducePorts(state: PortsState, event: BusEvent): PortsState {
  if (event.type !== "ports") return state;
  return { processes: event.processes, dot: state.dot || event.fresh.length > 0 };
}

export const portsStore = createStore<PortsState>({
  load: async () => ({ processes: await api.portProcesses(), dot: false }),
  reduce: reducePorts,
});

export const usePorts = () => useStore(portsStore);

/** 窓を開いた（調べ直して、点を消す） */
export function refreshPorts(): Promise<unknown> {
  portsStore.update((s) => (s.dot ? { ...s, dot: false } : s));
  return portsStore.reload();
}

/** ⌘K などから窓を開く頼み（下の帯のボタン、帯を隠していれば代わりの置き場所が受ける） */
export const OPEN_PORTS_EVENT = "kickoff:open-ports";
export const openPortsPopover = () => window.dispatchEvent(new Event(OPEN_PORTS_EVENT));
