import assert from "node:assert/strict";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { test, vi } from "vitest";
import { useFileActions } from "./useFileActions";

const menu = vi.hoisted(() => ({
  value: null as null | { path: string; dir: boolean; staged?: boolean; many: null },
  openFile: undefined as (() => void) | undefined,
}));

vi.mock("@/foundation/ui/kit/useContextMenu", () => ({
  useContextMenu: () => ({ menu: menu.value ? { value: menu.value, at: { x: 0, y: 0 } } : null, open: () => {}, close: () => {} }),
}));
vi.mock("@/foundation/ui/workplace/workplaceContext", () => ({ useGitTarget: () => ({ target: { projectId: 1 } }) }));
vi.mock("@/foundation/ui/kit/PopupMenu", async () => {
  const { createElement: h } = await import("react");
  return {
    PopupMenu: ({ children }: { children: ReactNode }) => h("div", null, children),
    MenuItem: ({ children, onSelect }: { children: ReactNode; onSelect: () => void }) => {
      if (Array.isArray(children) && children.includes(" ファイルタブで開く")) menu.openFile = onSelect;
      return h("button", null, children);
    },
  };
});

test("変更のファイルのメニューからファイルタブを開く。既存の差分を開く項目も残す", () => {
  vi.stubGlobal("window", {});
  const opened: string[] = [];
  const Harness = ({ explorer }: { explorer: boolean }) => {
    const { menuElement } = useFileActions(1, {
      root: "/repo", explorer,
      selection: {} as Parameters<typeof useFileActions>[1]["selection"],
      git: {} as Parameters<typeof useFileActions>[1]["git"],
      openTab: () => {}, openInFilesTab: (path) => opened.push(path), gitRun: () => {},
    });
    return createElement("div", null, menuElement);
  };
  for (const staged of [true, false]) {
    menu.value = { path: "src/example.ts", dir: false, staged, many: null };
    menu.openFile = undefined;
    const html = renderToStaticMarkup(createElement(Harness, { explorer: false }));
    assert.ok(html.includes("新しいタブで開く"));
    assert.ok(html.includes("ファイルタブで開く"));
    const select = menu.openFile as (() => void) | undefined;
    assert.ok(select);
    select();
  }
  assert.deepEqual(opened, ["src/example.ts", "src/example.ts"]);
  menu.openFile = undefined;
  assert.ok(!renderToStaticMarkup(createElement(Harness, { explorer: true })).includes("ファイルタブで開く"));
  menu.value = { path: "src", dir: true, many: null };
  assert.ok(!renderToStaticMarkup(createElement(Harness, { explorer: false })).includes("ファイルタブで開く"));
});
