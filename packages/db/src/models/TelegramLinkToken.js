const mongoose = require("../mongoose");

const { Schema } = mongoose;

const TelegramLinkTokenSchema = new Schema({
  tokenHash: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  playerId: {
    type: Number,
    required: true,
    index: true,
  },
  purpose: {
    type: String,
    enum: ["telegram-link"],
    default: "telegram-link",
    required: true,
  },
  expiresAt: {
    type: Date,
    required: true,
  },
  usedAt: {
    type: Date,
    default: null,
    index: true,
  },
  usedByChatId: {
    type: String,
    default: null,
  },
}, {
  timestamps: true,
});

TelegramLinkTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const TelegramLinkToken =
  mongoose.models.TelegramLinkToken
  || mongoose.model("TelegramLinkToken", TelegramLinkTokenSchema);

module.exports = TelegramLinkToken;
