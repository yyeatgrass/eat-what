import { LunchRoom } from "./room";

export { LunchRoom };

export interface Env {
  ROOM: DurableObjectNamespace<LunchRoom>;
}

const ROOM_NAME = "shared-lunch-table";

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/ws") {
      const id = env.ROOM.idFromName(ROOM_NAME);
      return env.ROOM.get(id).fetch(request);
    }
    return new Response("Not found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;
