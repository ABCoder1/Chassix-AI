import { buildServer } from "./server.js";

const port = Number(process.env.API_PORT ?? 3001);
const app = buildServer();

app
  .listen({ port, host: "0.0.0.0" })
  .then((address) => {
    console.log(`[api] listening on ${address}`);
  })
  .catch((err) => {
    console.error("[api] failed to start", err);
    process.exit(1);
  });
