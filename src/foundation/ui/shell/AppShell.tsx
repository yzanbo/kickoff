// アプリの殻: App（メインのウィンドウ）と PopoutApp（別ウィンドウ）が共通に置くもの。機能が appHosts に入れた物（根に置く部品・全体の副作用・包むもの・ダイアログ）と、
// 土台の物（説明・お知らせ・聞く・落とせない理由）を、ウィンドウで絞って order の順に置く
import { useEffect, type ComponentType, type ReactNode } from "react";
import { createCell, useCell } from "@/foundation/ui/store";
import { useCommandShortcuts } from "@/foundation/ui/commands";
import { LinkOpenerProvider } from "@/foundation/ui/external/LinkOpenerProvider";
import { AskHost } from "@/foundation/ui/kit/AskHost";
import { DropHintHost } from "@/foundation/ui/kit/DropHint";
import { DialogHost } from "@/foundation/ui/kit/openDialog";
import { HoverTip } from "@/foundation/ui/kit/HoverTip";
import { ToastHost } from "@/foundation/ui/kit/toast";
import { dockPopout, popoutKey } from "@/foundation/ui/navigation/popout";
import { receiveForwarded } from "@/foundation/ui/navigation/popoutNavigation";
import { onWindowMessage, postWindowMessage } from "@/foundation/ui/navigation/windowBus";
import { appHosts, onAppDialogRequested, type AppHost } from "./points";

type ShellWindow = "main" | "popout";

/** 土台が置く物（機能の物と同じ order の並びに入る） */
const BUILT_IN: readonly AppHost[] = [
  // マウスを乗せたときの説明（data-tip を付けた要素。ウィンドウ全体で 1 つ）
  { id: "hoverTip", windows: "both", order: 120, Host: HoverTip },
  { id: "toast", windows: "both", order: 140, Host: ToastHost },
  // 部品の外から開いたダイアログ（openDialog）
  { id: "dialog", windows: "both", order: 150, Host: DialogHost },
  { id: "ask", windows: "both", order: 210, Host: AskHost },
  // ドラッグ中に、落とせない理由をカーソルの横に出す（作業中のチャットは移せない、など）
  { id: "dropHint", windows: "main", order: 230, Host: DropHintHost },
];

/** このウィンドウに置く物（order の順） */
function hostsOf(window: ShellWindow): AppHost[] {
  return [...appHosts.items(), ...BUILT_IN].filter((h) => h.windows === "both" || h.windows === window).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

/** 開いているアプリのダイアログ（種類ごとに開くときに渡したもの。ないものは閉じている） */
const openDialogs = createCell<Readonly<Record<string, unknown>>>({});

function closeDialog(id: string) {
  const next = { ...openDialogs.get() };
  delete next[id];
  openDialogs.set(next);
}

/** メインのウィンドウ: 部品・別ウィンドウから頼まれたダイアログ（部品を登録した種類だけ。開いていれば渡すものを替える）と、別ウィンドウからの行き先・欄に戻す頼みを受ける */
function receiveShellRequests(): () => void {
  const dialogIds = new Set(appHosts.items().flatMap((h) => (h.dialog ? [h.dialog.id as string] : [])));
  const offs = [
    onAppDialogRequested(({ id, detail }) => {
      if (dialogIds.has(id)) openDialogs.set({ ...openDialogs.get(), [id]: detail });
    }),
    receiveForwarded(),
    onWindowMessage("dockPopout", ({ route }) => {
      // 開き直し終えたら別ウィンドウに知らせる（失敗しても閉じさせる）
      void dockPopout(route)
        .catch((e: unknown) => console.error("[popout] 欄に戻せませんでした", e))
        .finally(() => postWindowMessage("docked", { key: popoutKey(route) }));
    }),
  ];
  return () => {
    for (const off of offs) off();
  };
}

/** 機能の全体の副作用（hook を呼ぶだけの部品。項目は入れたあと変わらないので、呼ぶ順は描くたびに同じ） */
function HostEffect({ use }: { use: () => void }) {
  use();
  return null;
}

/**
 * 殻: ショートカット・全体の副作用・包むもの（外部リンクの開き方は土台。projectId はいま見ているプロジェクト）を置き、children を包む。
 * 根に置く部品とダイアログは AppHosts で、置きたい所に置く
 */
export function AppShell({ window, projectId, children }: { window: ShellWindow; projectId: number | undefined; children: ReactNode }) {
  useCommandShortcuts(window);
  useEffect(() => (window === "main" ? receiveShellRequests() : undefined), [window]);
  const hosts = hostsOf(window);
  let body = <LinkOpenerProvider projectId={projectId}>{children}</LinkOpenerProvider>;
  for (const { id, Provider } of [...hosts].reverse()) if (Provider) body = <Provider key={id}>{body}</Provider>;
  return (
    <>
      {hosts.map((h) => h.useEffect && <HostEffect key={h.id} use={h.useEffect} />)}
      {body}
    </>
  );
}

/** 根に置く部品と開いているダイアログのうち、order が from 以上・to 未満のもの（メインのウィンドウはレイアウトの開閉のボタンの前後に分けて置く） */
export function AppHosts({ window, from = -Infinity, to = Infinity }: { window: ShellWindow; from?: number; to?: number }) {
  const open = useCell(openDialogs);
  return hostsOf(window)
    .filter((h) => (h.order ?? 0) >= from && (h.order ?? 0) < to)
    .map(({ id, Host, dialog }) => {
      if (Host) return <Host key={id} />;
      if (!dialog || !(dialog.id in open)) return null;
      const Dialog = dialog.Dialog as ComponentType<{ detail: unknown; onClose(): void }>;
      return <Dialog key={id} detail={open[dialog.id]} onClose={() => closeDialog(dialog.id)} />;
    });
}
