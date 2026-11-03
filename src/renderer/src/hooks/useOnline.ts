import { useState } from "react";
import { useWindowEvent } from "./useWindowEvent";

/** この Mac がネットワークにつながっているか（Wi-Fi が切れると false。AI の API に届くかまでは見ない） */
export function useOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine);
  useWindowEvent("online", () => setOnline(true));
  useWindowEvent("offline", () => setOnline(false));
  return online;
}
