import "dotenv/config";
import { closeDatabase, connectDatabase } from "./db.js";
import { createUser } from "./auth.js";

const [username, displayName, role = "operator"] = process.argv.slice(2);
const password = process.env.GPB_USER_PASSWORD || "";
if (!username || !displayName || !["admin", "operator"].includes(role) || !password) {
  console.error("Usage: GPB_USER_PASSWORD='temporary password' npm run auth:create-user -- login 'Display Name' admin|operator");
  process.exit(1);
}
await connectDatabase();
try {
  console.log(JSON.stringify(await createUser({ username, displayName, password, role: role as "admin" | "operator" }), null, 2));
} finally {
  await closeDatabase();
}
