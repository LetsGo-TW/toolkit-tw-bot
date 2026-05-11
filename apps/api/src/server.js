const path = require("path");
const { getNodeEnv, loadEnv } = require("./config/load-env");

loadEnv();

const nodeEnv = getNodeEnv();
const isDev = nodeEnv === "development";
const isProd = nodeEnv === "production";
const isHeroku = !!process.env.DYNO;

const express = require("express");
const http = require("http");
const morgan = require("morgan");
const bodyParser = require("body-parser");

const corsMiddleware = require("./middlewares/cors.middleware");
const forceHttpsMiddleware = require("./middlewares/force-https.middleware");
const { startCleanupJob } = require("./database/cleanup-expired");
const publicDir = path.join(__dirname, "public");

// inicializa conexão com o MongoDB (usa database/index.js)
require("./database");

const app = express();

app.use(corsMiddleware);

// Heroku fica atrás de proxy, isso é importante pro redirect HTTPS
app.set("trust proxy", 1);

// força HTTPS em produção (Heroku)
app.use(forceHttpsMiddleware);

// servir arquivos estáticos da pasta public (inclui o index.html)
app.use(express.static(publicDir));

// se quiser garantir explicitamente a raiz:
app.get("/", (req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

 // --- Healthcheck para monitoramento (UptimeRobot, etc) ---
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    env: nodeEnv,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// middlewares comuns
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(morgan("dev"));

// controllers / rotas
require("./controllers/commands.controller")(app);
require("./controllers/api.controller")(app);
require("./controllers/solver.controller")(app);
require("./controllers/data.controller")(app);
require("./controllers/auth.controller")(app);
require("./controllers/admin.controller")(app);
require("./controllers/telegram.controller")(app);

const defaultPort = nodeEnv === "development" ? 4568 : nodeEnv === "test" ? 4570 : 4567;
const port = process.env.PORT || defaultPort;
const server = http.createServer(app);

server.listen(port, () => {
  console.log(`PORT:${port}. Server is running...`);

  // inicia o job diário de limpeza (due vencido há +3 meses)
  if (isHeroku || isProd) {
    startCleanupJob();
  }

  if (isDev) console.log(`http://localhost:${port}/health`)
});

server.on("error", (error) => {
  if (error?.code === "EADDRINUSE") {
    console.error(
      `[server] Porta ${port} já está em uso. Defina PORT ou finalize o processo que está ocupando essa porta.`,
    );
    process.exit(1);
  }

  console.error("[server] ", error);
  process.exit(1);
});

server.on("clientError", (err, socket) => {
  console.warn("[server] ", err.code || err);
  socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
});
