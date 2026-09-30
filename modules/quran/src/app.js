const express = require("express");
const cors = require("cors");
const { loadPack } = require("./pack");
const { mountQuran } = require("./mount");

/** Standalone app (tests, local dev). Production mounts the same routes via server.js. */
function createApp({ pack = loadPack(), annotations, remote, maxPerMinute = 120 } = {}) {
  const app = express();
  app.disable("x-powered-by");
  app.use(cors());
  mountQuran(app, { pack, ...(annotations ? { annotations } : {}), ...(remote ? { remote } : {}), maxPerMinute });
  app.get("/health", (req, res) => res.json({ status: "ok" }));
  app.use((req, res) => res.status(404).json({ error: { code: "NOT_FOUND", message: "Route not found." } }));
  return app;
}

module.exports = { createApp };
