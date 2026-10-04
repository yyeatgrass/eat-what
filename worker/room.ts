import { DurableObject } from "cloudflare:workers";

import {
  addRestaurant,
  advanceDebugDay,
  chooseLunch,
  emptyRoom,
  PICK_ERRORS,
  ROOM_TIME_ZONE,
  removeRestaurant,
  toPublicState,
  withSyncedWeek,
  type ClientMessage,
  type PublicState,
  type RoomData,
  type ServerMessage,
} from "../shared/lunch";

const STORAGE_KEY = "room";

function decode(message: ArrayBuffer | string): string {
  return typeof message === "string" ? message : new TextDecoder().decode(message);
}

function cryptoRandom(): number {
  const buffer = new Uint32Array(1);
  crypto.getRandomValues(buffer);
  return (buffer[0] ?? 0) / 4294967296;
}

export class LunchRoom extends DurableObject {
  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return new Response("Expected a WebSocket upgrade.", { status: 426 });
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    this.ctx.acceptWebSocket(server);

    const now = new Date();
    const room = await this.loadReady(now);
    server.send(JSON.stringify(stateMessage(toPublicState(room, now))));
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: ArrayBuffer | string): Promise<void> {
    let parsed: ClientMessage | null = null;
    try {
      parsed = parseMessage(decode(message));
    } catch {
      this.sendError(ws, "pick", "That message could not be read.");
      return;
    }
    if (!parsed) {
      this.sendError(ws, "pick", "That message could not be read.");
      return;
    }

    const now = new Date();
    const room = await this.loadReady(now);

    if (parsed.type === "heartbeat") {
      this.broadcast(toPublicState(room, now));
      return;
    }

    if (parsed.type === "setDebugKitchen") {
      const next = withSyncedWeek(
        parsed.open
          ? { ...room, debugKitchen: true, debugDate: null }
          : { ...room, debugKitchen: false, debugDate: null },
        now,
      ).room;
      await this.save(next);
      this.broadcast(toPublicState(next, now));
      return;
    }

    if (parsed.type === "advanceDebugDay") {
      const next = advanceDebugDay(room, now);
      await this.save(next);
      this.broadcast(toPublicState(next, now));
      return;
    }

    if (parsed.type === "setTimezone") {
      const next = withSyncedWeek({ ...room, timezone: ROOM_TIME_ZONE }, now).room;
      await this.save(next);
      this.broadcast(toPublicState(next, now));
      return;
    }

    if (parsed.type === "addRestaurant") {
      const added = addRestaurant(room, parsed.name, crypto.randomUUID());
      if (!added.ok) {
        this.sendError(ws, "restaurant", added.error);
        return;
      }
      await this.save(added.room);
      this.broadcast(toPublicState(added.room, now));
      return;
    }

    if (parsed.type === "removeRestaurant") {
      const next = removeRestaurant(room, parsed.id);
      await this.save(next);
      this.broadcast(toPublicState(next, now));
      return;
    }

    const outcome = chooseLunch(room, now, cryptoRandom);
    if (!outcome.ok) {
      this.sendError(ws, "pick", PICK_ERRORS[outcome.reason]);
      return;
    }
    await this.save(outcome.room);
    this.broadcast(toPublicState(outcome.room, now));
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
    ws.close(code, reason);
  }

  private async loadReady(now: Date): Promise<RoomData> {
    const stored = (await this.ctx.storage.get<RoomData>(STORAGE_KEY)) ?? emptyRoom();
    const zoned =
      stored.timezone === ROOM_TIME_ZONE ? stored : { ...stored, timezone: ROOM_TIME_ZONE };
    const synced = withSyncedWeek(zoned, now);
    if (synced.reset || zoned.timezone !== stored.timezone) await this.save(synced.room);
    return synced.room;
  }

  private async save(room: RoomData): Promise<void> {
    await this.ctx.storage.put(STORAGE_KEY, room);
  }

  private broadcast(state: PublicState): void {
    const payload = JSON.stringify(stateMessage(state));
    for (const socket of this.ctx.getWebSockets()) {
      try {
        socket.send(payload);
      } catch {
        // A socket can close between the list and the send.
      }
    }
  }

  private sendError(
    ws: WebSocket,
    scope: "restaurant" | "timezone" | "pick",
    message: string,
  ): void {
    const payload: ServerMessage = { type: "error", scope, message };
    try {
      ws.send(JSON.stringify(payload));
    } catch {
      // Ignore a socket that closed mid-error.
    }
  }
}

function stateMessage(state: PublicState): ServerMessage {
  return { type: "state", state };
}

function readString(value: object, key: string): string | null {
  if (!(key in value)) return null;
  const field = (value as Record<string, unknown>)[key];
  return typeof field === "string" ? field : null;
}

function parseMessage(raw: string): ClientMessage | null {
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== "object") return null;
  const type = readString(value, "type");
  if (type === "heartbeat" || type === "pick" || type === "advanceDebugDay") return { type };
  if (type === "setTimezone") {
    const timezone = readString(value, "timezone");
    return timezone === null ? null : { type, timezone };
  }
  if (type === "addRestaurant") {
    const name = readString(value, "name");
    return name === null ? null : { type, name };
  }
  if (type === "removeRestaurant") {
    const id = readString(value, "id");
    return id === null ? null : { type, id };
  }
  if (type === "setDebugKitchen") {
    if (!("open" in value)) return null;
    const open = (value as Record<string, unknown>).open;
    return typeof open === "boolean" ? { type, open } : null;
  }
  return null;
}
