/**
 * Encode AVIF gallery variants in a separate process so page requests
 * do not wait on sharp. Start with `npm run photos:worker`.
 *
 * Usage: npm run photos:worker
 */
import { drizzle } from "drizzle-orm/better-sqlite3";
import { openSqlite } from "../lib/db/sqlite";
import * as schema from "../lib/db/schema";
import {
  installPhotoWorkerSignals,
  runPhotoWorker,
} from "../lib/gallery/worker";

const sqlite = openSqlite();
const db = drizzle(sqlite, { schema });

let stopping = false;
const detach = installPhotoWorkerSignals(() => {
  stopping = true;
});

console.error("santa photo worker ready");
await runPhotoWorker(db, { shouldStop: () => stopping });
detach();
sqlite.close();
