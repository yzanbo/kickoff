// react-compiler-report.mjs の型（electron.vite.config.ts から読むため）
import type { Logger } from "babel-plugin-react-compiler";
import type { Plugin } from "vite";

export function reactCompilerReport(options: { allowList: string; out?: string; root?: string }): { logger: Logger; plugin: Plugin };
