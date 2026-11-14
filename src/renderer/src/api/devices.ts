import type { Device, PairingState, ViewingBody } from "@shared/types";
import { request } from "./http";

/** スマホ連携の端末とペアリング（コアの routes/devices.ts。この Mac の画面だけが使う口） */
export const devicesApi = {
  pairingState: () => request<PairingState>("GET", "/api/pairing"),
  /** 新しい番号を出す（前の番号は捨てる） */
  startPairing: () => request<PairingState>("POST", "/api/pairing"),
  cancelPairing: () => request<PairingState>("DELETE", "/api/pairing"),
  approvePairing: (requestId: string) => request<PairingState>("POST", `/api/pairing/requests/${encodeURIComponent(requestId)}/approve`),
  denyPairing: (requestId: string) => request<PairingState>("POST", `/api/pairing/requests/${encodeURIComponent(requestId)}/deny`),
  devices: () => request<Device[]>("GET", "/api/devices"),
  revokeDevice: (id: number) => request<void>("DELETE", `/api/devices/${id}`),
  /** いま見ているもの（だれかが見ているチャット・CI のタブの知らせは通知しない。この Mac の画面も端末も使う） */
  reportViewing: (body: ViewingBody) => request<void>("PUT", "/api/viewing", body),
  /** 窓を閉じる・読み込み直すときに「何も見ていない」を知らせる（ページが消えても届くよう keepalive。返事は待たない） */
  reportLeaving: () => void request<void>("PUT", "/api/viewing", { chat_id: null, ci_project_id: null } satisfies ViewingBody, { keepalive: true }).catch(() => {}),
};
