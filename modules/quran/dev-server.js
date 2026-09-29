// Local run: node modules/quran/dev-server.js  (PORT defaults to 3100)
const { createApp } = require("./src/app");

const port = Number(process.env.PORT) || 3100;
createApp().listen(port, () => console.log(`quran module on http://localhost:${port}/v1/quran/source`));
