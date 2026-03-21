// api/controllers/auth.controller.js
const express = require("express");
const router = express.Router();
const Player = require("../models/Player");
const jwt = require("jsonwebtoken");
const verifyDue = require("../middlewares/verify.due");

const JWT_SECRET = process.env.JWT_SECRET;

// PUBLIC - autenticar player e gerar token
router.post("/", async (req, res) => {
  const { player_id, world } = req.body;

  if (!player_id || !world) {
    return res
      .status(400)
      .send({ error: "Bad request - Invalid or missing data" });
  }

  try {
    // agora busca por world + player_id (sem key)
    const player = await Player.findOne({ world, player_id }).lean();

    if (!player) {
      return res
        .status(401)
        .send({ message: "Unauthorized - Licence not found" });
    }

    if (!verifyDue(player.due)) {
      return res
        .status(403)
        .send({ message: "Forbidden - Licence expired" });
    }

    const token = jwt.sign(
      { id: player._id, due: player.due },
      JWT_SECRET,
      { expiresIn: 3600 * 2 }, // 2h
    );

    return res.send({ player, token });
  } catch (error) {
    return res
      .status(500)
      .send({ error: error.message || "Internal server error" });
  }
});

// PUBLIC - renovar token
router.get("/", async (req, res) => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(400).send({
      error: "Bad request - Authorization provided not found",
    });
  }

  const parts = authHeader.split(" ");

  if (parts.length !== 2) {
    return res
      .status(400)
      .send({ error: "Bad request - Authorization scheme not found" });
  }

  const [scheme, token] = parts;

  if (!/^Bearer$/i.test(scheme)) {
    return res
      .status(400)
      .send({ error: "Bad request - Authorization scheme malformatted" });
  }

  jwt.verify(token, JWT_SECRET, (error, decoded) => {
    if (error) {
      if (error.name === "TokenExpiredError") {
        return res.status(401).send({ error: "Unauthorized - Token expired" });
      } else {
        return res
          .status(406)
          .send({ error: "Unauthorized - Invalid token" });
      }
    }

    if (!decoded.due || !decoded.id) {
      return res
        .status(406)
        .send({ error: "Unauthorized - Invalid token payload" });
    }

    if (!verifyDue(decoded.due)) {
      return res
        .status(403)
        .send({ error: "Forbidden - Licence expired" });
    }

    const newToken = jwt.sign(
      { id: decoded.id, due: decoded.due },
      JWT_SECRET,
      { expiresIn: 3600 }, // 1h
    );

    return res.send({ token: newToken });
  });
});

module.exports = (app) => app.use("/auth", router);
