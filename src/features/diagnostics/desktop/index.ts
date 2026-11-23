// 診断のメインの部品（src/app/desktop/index.ts が土台へ渡す）: IPC の diagnostics・メニューの「ヘルプ」の性能の記録・コアの分の記録
import type { CoreProcess } from "@/foundation/desktop/app/coreProcess";
import { mainWindow } from "@/foundation/desktop/app/window";
import { defineDesktopPart } from "@/foundation/desktop/parts";
import { diagnosticsArgs } from "./ipcArgs";
import { DIAGNOSTICS_SECONDS, diagnosticsHandlers, openDiagnosticsRoot, setDiagnosticsCore, startDiagnostics } from "./diagnostics";

let created: CoreProcess | null = null;

export const diagnosticsDesktop = defineDesktopPart({
  name: "diagnostics",
  ipc: { diagnostics: diagnosticsHandlers },
  argSchemas: diagnosticsArgs,
  menu: [
    { label: `性能の記録を取る（${DIAGNOSTICS_SECONDS} 秒）`, click: () => void startDiagnostics(mainWindow()) },
    { label: "性能の記録の保存先を開く", click: () => void openDiagnosticsRoot() },
  ],
  connectCore(core) {
    created = core;
  },
  ready() {
    // 画面のセッションを置いてから、記録にコアの分も入れる（それまでは「コアがまだ起動していません」）
    if (created) setDiagnosticsCore(created);
  },
});
