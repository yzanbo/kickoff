// 機能だけが使う OS の値を、いまの OS で選ぶ（いまは macOS だけ。ほかの OS を足すときは、ここと src/foundation/desktop/platform/index.ts で選び分ける）。
// 機能に依らない OS の口は土台の HostPlatform（@/foundation/core/platform/macos/index.ts）
import type { HostPlatform } from "@/foundation/core/platform/types";
import type { OsSpeech } from "@/features/voice/core/types";
import { macosSpeech } from "@/features/voice/core/macos";
import type { AgentSandboxRules, SelfGuardRules } from "@/features/guard/core/platformRules";
import { MACOS_SELF_GUARD } from "@/features/guard/core/macosRules";
import { macosAgentSandbox } from "@/features/guard/core/macosSandbox";
import type { SandboxDiagnosticsPlatform } from "@/features/guard/core/sandboxDiagnosticsPlatform";
import { macosSandboxDiagnostics } from "@/features/guard/core/macosSandboxDiagnostics";
import type { DockerEngineStarters } from "@/features/docker/core/engine";
import { macosDockerEngine } from "@/features/docker/core/macosEngine";
import { macosTailscaleCli } from "@/features/devices/core/macosTailscale";
import type { TerminalShell } from "@/features/terminal/core/shell";
import { macosTerminalShell } from "@/features/terminal/core/macosShell";

/** 機能だけが使う OS の値（startCore が各機能に渡す） */
export interface CorePlatformParts {
  /** OS の音声認識（voice） */
  speech: OsSpeech;
  /** 自分（エージェントを動かしている Kickoff）を止めるコマンドの見分け方（guard） */
  selfGuard: SelfGuardRules;
  /** AI の Bash の砂場に OS ごとに足す決まり（guard） */
  agentSandbox: AgentSandboxRules;
  /** OS の拒否ログの限定診断（guard。未対応ならツールを出さない） */
  sandboxDiagnostics?: SandboxDiagnosticsPlatform;
  /** Docker のエンジンの起こし方（docker） */
  dockerEngine: DockerEngineStarters;
  /** tailscale のコマンドの場所（devices。入っていなければ null。設定の「スマホ連携」の Tailscale Serve の案内） */
  tailscaleCli: () => string | null;
  /** 内蔵ターミナルのシェル（terminal。シェルはコアで動かす） */
  terminalShell: () => TerminalShell;
}

/** macOS の値を作る（speechHelper は音声認識の補助コマンド kickoff-speech の場所。なければ音声認識は使えない扱い） */
export function macosParts(platform: Pick<HostPlatform, "openApp">, { speechHelper = null }: { speechHelper?: string | null } = {}): CorePlatformParts {
  return {
    speech: macosSpeech(speechHelper),
    selfGuard: MACOS_SELF_GUARD,
    agentSandbox: macosAgentSandbox(),
    sandboxDiagnostics: macosSandboxDiagnostics,
    dockerEngine: macosDockerEngine(platform.openApp),
    tailscaleCli: macosTailscaleCli,
    terminalShell: macosTerminalShell,
  };
}
