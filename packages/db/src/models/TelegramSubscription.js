const mongoose = require("../mongoose");

const { Schema } = mongoose;

const TelegramSubscriptionSchema = new Schema({
  playerId: {
    type: Number,
    required: true,
    index: true,
  },
  chatId: {
    type: String,
    required: true,
    index: true,
  },
  telegramUserId: {
    type: String,
    default: null,
    index: true,
  },
  username: {
    type: String,
    default: null,
  },
  firstName: {
    type: String,
    default: null,
  },
  lastName: {
    type: String,
    default: null,
  },
  phoneNumber: {
    type: String,
    default: null,
  },
  status: {
    type: String,
    enum: ["active", "revoked", "blocked"],
    default: "active",
    index: true,
  },
  linkedAt: {
    type: Date,
    default: Date.now,
  },
  revokedAt: {
    type: Date,
    default: null,
  },
  blockedAt: {
    type: Date,
    default: null,
  },
  lastInboundAt: {
    type: Date,
    default: null,
  },
  lastOutboundAt: {
    type: Date,
    default: null,
  },
  lastErrorAt: {
    type: Date,
    default: null,
  },
  lastErrorMessage: {
    type: String,
    default: null,
  },
}, {
  timestamps: true,
});

TelegramSubscriptionSchema.index({ playerId: 1, chatId: 1 }, { unique: true });
TelegramSubscriptionSchema.index({ chatId: 1, status: 1 });
TelegramSubscriptionSchema.index({ playerId: 1, status: 1 });

const TelegramSubscription =
  mongoose.models.TelegramSubscription
  || mongoose.model("TelegramSubscription", TelegramSubscriptionSchema);

module.exports = TelegramSubscription;
