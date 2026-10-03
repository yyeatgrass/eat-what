import { useCallback, useEffect, useRef, useState } from "react";

import type { ClientMessage, PublicState, ServerMessage } from "../shared/lunch";

export type ConnectionStatus = "connecting" | "live" | "disconnected";

export type RoomNotice = {
  scope: "restaurant" | "timezone" | "pick";
  message: string;
  at: number;
};

const HEARTBEAT_MS = 30_000;

export function useRoom() {
  const socketRef = useRef<WebSocket | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [state, setState] = useState<PublicState | null>(null);
  const [notice, setNotice] = useState<RoomNotice | null>(null);

  const send = useCallback((message: ClientMessage) => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return false;
    socket.send(JSON.stringify(message));
    return true;
  }, []);

  useEffect(() => {
    let stopped = false;
    let socket: WebSocket | null = null;
    let heartbeat = 0;
    let retry = 0;
    let retryTimer = 0;

    const connect = () => {
      if (stopped) return;
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      socket = new WebSocket(`${protocol}//${window.location.host}/ws`);
      socketRef.current = socket;

      socket.onopen = () => {
        retry = 0;
        setStatus("live");
        window.clearInterval(heartbeat);
        heartbeat = window.setInterval(() => {
          if (socket?.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: "heartbeat" } satisfies ClientMessage));
          }
        }, HEARTBEAT_MS);
      };

      socket.onmessage = (event) => {
        if (typeof event.data !== "string") return;
        let message: ServerMessage;
        try {
          message = JSON.parse(event.data) as ServerMessage;
        } catch {
          return;
        }
        if (message.type === "state") {
          setState(message.state);
          return;
        }
        if (message.type === "error") {
          setNotice({ scope: message.scope, message: message.message, at: Date.now() });
        }
      };

      socket.onclose = () => {
        window.clearInterval(heartbeat);
        if (socketRef.current === socket) socketRef.current = null;
        if (stopped) return;
        setStatus("disconnected");
        const delay = Math.min(8_000, 400 * 2 ** retry);
        retry += 1;
        retryTimer = window.setTimeout(connect, delay);
      };
    };

    connect();

    return () => {
      stopped = true;
      window.clearInterval(heartbeat);
      window.clearTimeout(retryTimer);
      socket?.close();
    };
  }, []);

  return { status, state, notice, send };
}
