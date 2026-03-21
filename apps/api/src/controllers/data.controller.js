const fs = require("fs");
const express = require("express");
const path = require("path");
const authMiddleware = require("../middlewares/auth.middleware");

const router = express.Router();
const srcDir = path.resolve(__dirname, "..");
const jsonDir = path.join(srcDir, "json");

router.use(authMiddleware);

router.get("/*", (req, res) => {
  const relativePath = String(req.params[0] || "").replace(/^\/+/, "");

  if (!relativePath.startsWith("json/") || !relativePath.endsWith(".json")) {
    return res.status(404).send({ error: "Not found" });
  }

  const filePath = path.join(srcDir, path.normalize(relativePath));

  if (!filePath.startsWith(`${jsonDir}${path.sep}`)) {
    return res.status(400).send({ error: "Bad request - Invalid path" });
  }

  try {
    if (!fs.existsSync(filePath)) {
      return res.status(404).send({ error: "Not found" });
    }

    const fileContents = fs.readFileSync(filePath, "utf8");
    return res.json(JSON.parse(fileContents));
  } catch (error) {
    return res.status(500).send({
      error: error.message || "Internal server error",
    });
  }
});

module.exports = (app) => app.use("/data", router);
