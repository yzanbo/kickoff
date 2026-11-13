// ポートを使っているプロセスの一覧（全プロジェクト）と、下の帯のボタンの点。
// 下の帯が出たとき（起動したとき）に、コアが最後に調べた一覧（まだなら調べる）を読む。コアの知らせ ports_changed（窓を開いた・↻・止めた・
// チャットの実行が終わったときに調べた）は数だけなので、受けたら覚えた一覧を読み直す（一覧はコマンドの全文を含むので SSE に載せない）。
// Mac のアプリの中だけで使う（口はこの Mac からだけ。スマホの画面ではボタンも出さない）
import { useSyncExternalStore } from "react";
import type { PortProcess } from "@shared/types";
import { api } from "@/api";
import { subscribeServerEvent } from "@/api/events";
import { createStore } from "@/stores/createStore";
import { useStore } from "@/stores/useStore";

/** この画面で使えるか（Mac のアプリの中だけ。スマホのブラウザではコアが断る） */
export const portsAvailable = () => typeof window !== "undefined" && window.kickoff !== undefined;

export const portsStore = createStore<PortProcess[]>({
  load: () => api.portProcesses(true),
  reloadOn: (e) => e.type === "ports_changed",
});

export const usePorts = () => useStore(portsStore);

// ---- 点（チャットの実行の間に新しく現れたものがある。窓を開くと消す） ----

let dot = false;
const dotListeners = new Set<() => void>();
const setDot = (value: boolean) => {
  if (dot === value) return;
  dot = value;
  for (const l of dotListeners) l();
};
subscribeServerEvent((e) => {
  if (e.type === "ports_changed" && e.fresh > 0) setDot(true);
});

export const usePortsDot = () =>
  useSyncExternalStore(
    (l) => {
      dotListeners.add(l);
      return () => void dotListeners.delete(l);
    },
    () => dot,
  );

/** 窓を開いた・↻（調べ直して、点を消す。ほかの窓には ports_changed で届く） */
export async function refreshPorts(): Promise<void> {
  setDot(false);
  portsStore.set(await api.portProcesses());
}

/** ⌘K などから窓を開く頼み（下の帯のボタン、帯を隠していれば代わりの置き場所が受ける） */
export const OPEN_PORTS_EVENT = "kickoff:open-ports";
export const openPortsPopover = () => window.dispatchEvent(new Event(OPEN_PORTS_EVENT));
