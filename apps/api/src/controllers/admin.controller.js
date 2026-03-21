// api/controllers/admin.controller.js
const express = require("express");
const router = express.Router();
const Player = require("../models/Player");

const ADMIN_SECRET = process.env.ADMIN_SECRET;

// Listar todos os players
router.get("/:secret", async (req, res) => {
  const { secret } = req.params;

  if (secret !== ADMIN_SECRET) {
    return res
      .status(400)
      .send({ error: "Bad request - Authorization scheme malformatted" });
  }

  try {
    // .lean() (vem como objeto simples, não documento Mongoose)
    const players = await Player.find().lean();
    return res.send(players);
  } catch (error) {
    return res
      .status(500)
      .send({ error: error.message || "Internal server error" });
  }
});

// Buscar player por ID
router.get("/:secret/:id", async (req, res) => {
  const { secret, id } = req.params;

  if (secret !== ADMIN_SECRET) {
    return res
      .status(400)
      .send({ error: "Bad request - Authorization scheme malformatted" });
  }

  if (!id) {
    return res
      .status(400)
      .send({ error: "Bad request - Invalid or missing id" });
  }

  try {
    const player = await Player.findById(id).lean();

    if (!player) {
      return res.status(404).send({ error: "Not found" });
    }

    return res.send(player);
  } catch (error) {
    return res
      .status(500)
      .send({ error: error.message || "Internal server error" });
  }
});

// Registrar novo player (licença)
router.post("/:secret/register", async (req, res) => {
  const { secret } = req.params;

  if (secret !== ADMIN_SECRET) {
    return res
      .status(400)
      .send({ error: "Bad request - Authorization scheme malformatted" });
  }

  const { player_id, world, due } = req.body;

  if (!player_id || !world || !due) {
    return res
      .status(400)
      .send({ error: "Bad request - Invalid or missing data" });
  }

  try {
    // verifica se já existe licença para esse world + player_id
    const existing = await Player.findOne({ world, player_id }).lean();

    if (existing) {
      return res
        .status(409)
        .send({ error: "Conflict - Licence already exists" });
    }

    const player = await Player.create({
      player_id,
      world,
      due,
      createdAt: req.body.createdAt, // se vier do JSON, senão usa default
      updatedAt: req.body.updatedAt || null,
    });

    return res.send(player);
  } catch (error) {
    return res
      .status(500)
      .send({
        error: error.message || "Not found - Registration failed",
      });
  }
});

// Atualizar player por ID
router.put("/:secret/update/:id", async (req, res) => {
  const { secret, id } = req.params;

  if (secret !== ADMIN_SECRET) {
    return res
      .status(400)
      .send({ error: "Bad request - Authorization scheme malformatted" });
  }

  if (!id || !req.body) {
    return res
      .status(400)
      .send({ error: "Bad request - Invalid or missing data" });
  }

  try {
    const updates = {
      ...req.body,
      updatedAt: Date.now(),
    };

    const updated = await Player.findByIdAndUpdate(
      id,
      { $set: updates },
      { new: true, runValidators: true },
    ).lean();

    if (!updated) {
      return res.status(404).send({ error: "Not found" });
    }

    return res.send(updated);
  } catch (error) {
    return res
      .status(500)
      .send({
        error: error.message || "Not found - Updated failed",
      });
  }
});

// Deletar player por ID
router.delete("/:secret/delete/:id", async (req, res) => {
  const { secret, id } = req.params;

  if (secret !== ADMIN_SECRET) {
    return res
      .status(400)
      .send({ error: "Bad request - Authorization scheme malformatted" });
  }

  if (!id) {
    return res
      .status(400)
      .send({ error: "Bad request - Invalid or missing id" });
  }

  try {
    const deleted = await Player.findByIdAndDelete(id).lean();

    if (!deleted) {
      return res.status(404).send({ error: "Not found" });
    }

    return res.send(deleted);
  } catch (error) {
    return res
      .status(500)
      .send({
        error: error.message || "Not found - Deleted failed",
      });
  }
});

module.exports = (app) => app.use("/admin", router);
