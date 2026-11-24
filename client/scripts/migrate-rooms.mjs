// One-time migration: node scripts/migrate-rooms.mjs
// Needs MONGODB_URI (and optionally MONGODB_DB) in the environment, e.g. after
// `vercel env pull .env.local` and: node --env-file=.env.local scripts/migrate-rooms.mjs
// Asks (in the terminal only) which old sync code goes to which room and the
// PIN of each room. Nothing typed here is written to disk or logged.
import { createInterface } from "node:readline/promises";
import { getCatalog, getRooms, roomIdFor } from "../api/_db.js";
import { ensureDefaultRooms, hashPin, isValidPin } from "../api/_session.js";
import { migrateRoom } from "../api/_migrate.js";

const rl = createInterface({ input: process.stdin, output: process.stdout });
const rooms = await getRooms();
const catalog = await getCatalog();
await ensureDefaultRooms(rooms);
const slots = await rooms.find({ slot: { $exists: true } }).sort({ slot: 1 }).toArray();

for (const room of slots) {
  console.log(`\n== ${room.name} ==`);
  const code = (await rl.question("Old sync code to copy into this room (empty = none): ")).trim();
  if (code) {
    const result = await migrateRoom({ rooms, catalog }, roomIdFor(code), room._id);
    console.log(result.ok ? `Copied (${result.copiedCatalogDocs} imported-list docs).` : `Skipped: ${result.reason}`);
  }
  const pin = (await rl.question("4-digit PIN for this room (empty = leave unchanged/none): ")).trim();
  if (pin) {
    if (!isValidPin(pin)) console.log("Not 4 digits, PIN left unchanged.");
    else {
      await rooms.updateOne({ _id: room._id }, { $set: { pinAuth: hashPin(pin), updatedAt: new Date() } });
      console.log("PIN set.");
    }
  }
}
rl.close();
console.log("\nDone. Old documents were kept. Delete them only after you verified everything.");
process.exit(0);
