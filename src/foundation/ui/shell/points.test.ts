import assert from "node:assert/strict";
import { onTestFinished, test, vi } from "vitest";
import { useTestContributions } from "@/foundation/ui/testing/contributions";
import { popoutKinds } from "@/foundation/ui/navigation/popout";
import { appHosts, footerItems, onAppDialogRequested, openAppDialog, type AppDialogRequest } from "./points";

declare module "./points" {
  interface AppDialogMap {
    /** テストだけのダイアログ */
    sampleDialog: { n: number };
    plainDialog: null;
  }
}

const Empty = () => null;

test("footerItems・appHosts: order の順に並ぶ（appHosts の order は省けば 0）", () => {
  useTestContributions([
    footerItems.item({ id: "b", side: "end", order: 20, Item: Empty }),
    footerItems.item({ id: "a", side: "start", order: 10, Item: Empty }),
    appHosts.item({ id: "late", windows: "main", order: 5 }),
    appHosts.item({ id: "first", windows: "both" }),
  ]);
  assert.deepEqual(footerItems.items().map((i) => i.id), ["a", "b"]);
  assert.deepEqual(appHosts.items().map((h) => h.id), ["first", "late"]);
});

test("openAppDialog: メインのウィンドウでは、そのウィンドウの受け手に種類と渡すもの（なければ null）を届ける", () => {
  vi.stubGlobal("location", { hash: "#/projects/1" });
  useTestContributions([popoutKinds.item({ kind: "sidebar", fields: {} })]);
  const got: AppDialogRequest[] = [];
  onTestFinished(onAppDialogRequested((r) => got.push(r)));
  openAppDialog("sampleDialog", { n: 1 });
  openAppDialog("plainDialog");
  assert.deepEqual(got, [
    { id: "sampleDialog", detail: { n: 1 } },
    { id: "plainDialog", detail: null },
  ]);
});

test("openAppDialog: 別ウィンドウでは、そのウィンドウでは開かずメインのウィンドウへ送って前に出す", () => {
  vi.stubGlobal("location", { hash: "#/popout/sidebar" });
  const focusMain = vi.fn(async () => {});
  vi.stubGlobal("window", { kickoff: { windows: { focusMain } } });
  useTestContributions([popoutKinds.item({ kind: "sidebar", fields: {} })]);
  const got: AppDialogRequest[] = [];
  onTestFinished(onAppDialogRequested((r) => got.push(r)));
  openAppDialog("sampleDialog", { n: 2 });
  assert.deepEqual(got, []);
  assert.equal(focusMain.mock.calls.length, 1);
});
