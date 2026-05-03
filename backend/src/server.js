const http = require("http");
const { createApp } = require("./app");
const { createSignalingServer } = require("./ws/signalingServer");
const { port } = require("./config/env");

const app = createApp();
const server = http.createServer(app);
createSignalingServer(server);

server.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`PoC server running at http://localhost:${port}`);
});
