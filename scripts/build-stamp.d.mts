// build-stamp.mjs の型（electron.vite.config.ts から読むため）
import type { BuildKind, BuildStamp } from "../src/shared/updates/types";

export const KINDS: BuildKind[];
export function buildKindOf(value: string | undefined): BuildKind;
export function parseBuildNumber(output: string): number | null;
export function readBuildStamp(cwd?: string, env?: Record<string, string | undefined>): BuildStamp;
