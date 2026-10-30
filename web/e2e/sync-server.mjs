import { Store } from "../../server/src/store.mjs";
import { createApi } from "../../server/src/http.mjs";
const store = new Store(":memory:", "e2e-test-only-password");
const server = createApi(store, { allowedOrigins: ["http://127.0.0.1:4174"] });
server.listen(8790, "127.0.0.1", () =>
  console.log("Test-only sync fixture listening on 8790"),
);
process.on("SIGTERM", () =>
  server.close(() => {
    store.close();
    process.exit(0);
  }),
);
