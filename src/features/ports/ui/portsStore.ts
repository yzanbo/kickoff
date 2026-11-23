// ポートを使っているプロセスの一覧（全プロジェクト）と、下の帯のボタンの点。
// 下の帯が出たとき（起動したとき）に、コアが最後に調べた一覧（まだなら調べる）を読む。コアの知らせ ports_changed（窓を開いた・↻・止めた・
// チャットの実行が終わったときに調べた）は数だけなので、受けたら覚えた一覧を読み直す（一覧はコマンドの全文を含むので SSE に載せない）。
// Mac のアプリの中だけで使う（口はこの Mac からだけ。スマホの画面ではボタンも出さない）
import type { PortProcess } from "@shared/ports/types";
import { onServerEvent } from "@/foundation/ui/api/events";
import { createCell, createSignal, useCell } from "@/foundation/ui/store";
import { createStore } from "@/foundation/ui/store/createStore";
import { useStore } from "@/foundation/ui/store/useStore";
import { portsApi } from "./api/ports";

export const portsStore = createStore<PortProcess[]>({
  load: () => portsApi.portProcesses(true),
  reloadOn: { ports_changed: true },
});

export const usePorts = () => useStore(portsStore);

// ---- 点（チャットの実行の間に新しく現れたものがある。窓を開くと消す） ----

const dot = createCell(false);
onServerEvent("ports_changed", (e) => {
  if (e.fresh > 0) dot.set(true);
});

export const usePortsDot = () => useCell(dot);

/** 窓を開いた・↻（調べ直して、点を消す。ほかの窓には ports_changed で届く） */
export async function refreshPorts(): Promise<void> {
  dot.set(false);
  portsStore.set(await portsApi.portProcesses());
}

/** ⌘K などから窓を開く頼み（下の帯のボタン、帯を隠していれば代わりの置き場所が受ける） */
export const portsOpenRequests = createSignal();
export const openPortsPopover = () => portsOpenRequests.emit();
