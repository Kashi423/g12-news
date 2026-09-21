import { Client } from "pg";
import { BreakingBroker, type ListenClient } from "./broker";
import { getBreakingItem, getBreakingItems, invalidateBreakingCache } from "./queries";

// One broker per server process, kept on globalThis so dev-mode hot reloads don't leak connections.
const holder = globalThis as unknown as { __g12BreakingBroker?: BreakingBroker };

export function getBreakingBroker(): BreakingBroker {
  return (holder.__g12BreakingBroker ??= new BreakingBroker({
    createClient() {
      const connectionString = process.env.DATABASE_URL;
      if (!connectionString) throw new Error("DATABASE_URL is not set");
      return new Client({ connectionString, keepAlive: true }) as unknown as ListenClient;
    },
    fetchItem: (id) => getBreakingItem(id),
    fetchSnapshot: async () => {
      invalidateBreakingCache();
      return getBreakingItems();
    },
    onNotification: invalidateBreakingCache,
    log: (message) => console.warn(`[breaking] ${message}`),
  }));
}
