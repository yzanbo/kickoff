// kickoff_chat のツールの結果の形（文・失敗の理由の文）と、失敗を理由の文にして返す包み
import { errorMessage } from "@shared/errors";

/** ツールの結果（文） */
export const text = (s: string) => ({ content: [{ type: "text" as const, text: s }] });

/** ツールの失敗（理由の文） */
export const failure = (e: unknown) => ({ content: [{ type: "text" as const, text: errorMessage(e) }], isError: true });

/** 中身を呼んで文で返し、投げたら理由の文で返す */
export const run =
  <A>(fn: (args: A) => string | Promise<string>) =>
  async (args: A) => {
    try {
      return text(await fn(args));
    } catch (e) {
      return failure(e);
    }
  };
