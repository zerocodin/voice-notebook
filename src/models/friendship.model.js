const mongoose = require("mongoose");

const friendshipSchema = new mongoose.Schema(
  {
    requester: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
      index: true,
    },
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["pending", "accepted", "rejected", "blocked"],
      default: "pending",
      index: true,
    },
    // Which side blocked (only relevant when status === "blocked")
    blockedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      default: null,
    },
    respondedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

// Prevent duplicate pairs (in either direction)
friendshipSchema.index(
  { requester: 1, recipient: 1 },
  { unique: true }
);

// Fast lookup: "all friendships involving me"
friendshipSchema.index({ requester: 1, status: 1 });
friendshipSchema.index({ recipient: 1, status: 1 });

// Guard: user cannot befriend themselves
friendshipSchema.pre("validate", function (next) {
  if (this.requester.toString() === this.recipient.toString()) {
    return next(new Error("Cannot create a friendship with yourself"));
  }
  next();
});

const Friendship = mongoose.model("friendship", friendshipSchema);
module.exports = {Friendship}