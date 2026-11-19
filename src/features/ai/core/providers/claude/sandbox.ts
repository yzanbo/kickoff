// AI の Bash の砂場を Claude Code の砂場の設定（SDK の sandbox。macOS の Seatbelt）に直す（一覧はコアの chat/sandbox/bashSandbox.ts）
import type { Options } from "@anthropic-ai/claude-agent-sdk";
import type { BashSandbox } from "@/features/guard/core/sandbox/bashSandbox";

/** Claude Code が中継の承認を聞くときのツールの名前（自分の中継を使うときだけ来る。ネットワークは絞らないので、聞かずに許す） */
export const SANDBOX_NETWORK_TOOL = "SandboxNetworkAccess";

/**
 * 砂場の設定。絞るのは書き込みだけで、Claude Code の砂場が既定で断るほかのもの（この Mac の中の開発サーバー・DB への接続と待ち受け、docker などの Unix ソケット、
 * キーチェーン（gh の鍵）などのシステムのサービス、外への通信）は通す（どれも、通さないと止まる）
 */
export function claudeSandbox(sandbox: BashSandbox): NonNullable<Options["sandbox"]> {
  return {
    enabled: true,
    // 砂場を起こせなければ、砂場なしで流さずに作業を失敗にする（砂場を切る設定は足さない）
    failIfUnavailable: true,
    // 砂場の外で流し直す道（dangerouslyDisableSandbox）は切る。外で流すのは決まりのコマンドだけ
    allowUnsandboxedCommands: false,
    excludedCommands: sandbox.unsandboxedCommands,
    // Claude Code は読めるフォルダ（additionalDirectories）も書けるようにするので、添付・参照資料は書かせない側に入れる
    filesystem: { allowWrite: sandbox.writableDirs, denyWrite: sandbox.readOnlyDirs },
    network: {
      allowLocalBinding: true,
      allowAllUnixSockets: true,
      allowMachLookup: ["*"],
      ...(sandbox.proxyPort !== null ? { httpProxyPort: sandbox.proxyPort } : {}),
    },
  };
}

/** 利用者が明示的にオフを選んだときは、Claude Code の設定も無効にする。省略時は既存の動作を保つ */
export function claudeSandboxOption(sandbox: BashSandbox | null | undefined, disabled: boolean | undefined): Options["sandbox"] {
  return disabled ? { enabled: false } : sandbox ? claudeSandbox(sandbox) : undefined;
}
