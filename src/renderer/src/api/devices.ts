import type { Device, PairingState } from "@shared/types";
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
};
