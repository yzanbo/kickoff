import { createHash } from "node:crypto";

/** 端末のトークン・ペアリングの番号と鍵の hash（端末の表にはこれだけを置く） */
export const hashToken = (token: string): string => createHash("sha256").update(token).digest("hex");
