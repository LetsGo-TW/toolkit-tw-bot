const mongoose = require("../mongoose");

const { Schema } = mongoose;

const PlayerSchema = new Schema({
  player_id: {
    type: Number,
    required: true,
  },
  world: {
    type: String,
    required: true,
  },
  due: {
    type: Number,
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
  },
});

PlayerSchema.index({ world: 1, player_id: 1 }, { unique: true });

const Player = mongoose.models.Player || mongoose.model("Player", PlayerSchema);

module.exports = Player;
