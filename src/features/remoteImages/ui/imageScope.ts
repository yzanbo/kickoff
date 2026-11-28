// 外の画像の表示の許可を覚える範囲: チャット 1 つか、ノート 1 つ（押したホストはその範囲の中だけ覚える）
import type { ImageHost } from "@shared/remoteImages/types";
import { noteImagesApi, remoteImagesApi } from "./api";

export type ImageScope = { kind: "chat"; chatId: number } | { kind: "note"; projectId: number; path: string };

/** 範囲の鍵（許可したホストの店・取ってきた画像の覚えの鍵） */
export const scopeKey = (scope: ImageScope): string => (scope.kind === "chat" ? `chat:${scope.chatId}` : `note:${scope.projectId}:${scope.path}`);

/** 鍵から範囲（scopeKey の逆。ノートのパスに : があってもよい） */
export function scopeOfKey(key: string): ImageScope {
  if (key.startsWith("chat:")) return { kind: "chat", chatId: Number(key.slice(5)) };
  const rest = key.slice(5);
  const sep = rest.indexOf(":");
  return { kind: "note", projectId: Number(rest.slice(0, sep)), path: rest.slice(sep + 1) };
}

/** 範囲の呼び名（「このチャット」「このノート」。案内の文に入れる） */
export const scopeLabel = (scope: ImageScope) => (scope.kind === "chat" ? "このチャット" : "このノート");

/** 許可したホストの一覧 */
export async function fetchHosts(scope: ImageScope): Promise<ImageHost[]> {
  if (scope.kind === "chat") return (await remoteImagesApi("GET /api/chats/:chatId/image-hosts", { params: { chatId: scope.chatId } })).hosts;
  return (await noteImagesApi("GET /api/projects/:projectId/note-image-hosts", { params: { projectId: scope.projectId }, query: { path: scope.path } })).hosts;
}

/** ホストを許可する（変わったあとの一覧） */
export async function putHost(scope: ImageScope, host: string): Promise<ImageHost[]> {
  if (scope.kind === "chat") return (await remoteImagesApi("PUT /api/chats/:chatId/image-hosts", { params: { chatId: scope.chatId }, body: { host } })).hosts;
  return (await noteImagesApi("PUT /api/projects/:projectId/note-image-hosts", { params: { projectId: scope.projectId }, body: { path: scope.path, host } })).hosts;
}

/** 許可を外す（変わったあとの一覧） */
export async function deleteHost(scope: ImageScope, host: string): Promise<ImageHost[]> {
  if (scope.kind === "chat") return (await remoteImagesApi("DELETE /api/chats/:chatId/image-hosts", { params: { chatId: scope.chatId }, query: { host } })).hosts;
  return (await noteImagesApi("DELETE /api/projects/:projectId/note-image-hosts", { params: { projectId: scope.projectId }, query: { path: scope.path, host } })).hosts;
}

/** 許可したホストの画像（コアが代わりに取ったもの） */
export async function fetchRemoteImage(scope: ImageScope, url: string): Promise<Blob> {
  if (scope.kind === "chat") return (await remoteImagesApi("GET /api/chats/:chatId/remote-image", { params: { chatId: scope.chatId }, query: { url } })).blob;
  return (await noteImagesApi("GET /api/projects/:projectId/note-remote-image", { params: { projectId: scope.projectId }, query: { path: scope.path, url } })).blob;
}
