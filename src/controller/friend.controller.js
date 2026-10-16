const { Friendship } = require("../models/friendship.model");
const {User} = require("../models/user.model")

const isValidId = (id) => /^[0-9a-fA-F]{24}$/.test(id);

/**
 * Find any Friendship doc between two users, regardless of direction.
 */
async function findPair(a, b) {
  return Friendship.findOne({
    $or: [
      { requester: a, recipient: b },
      { requester: b, recipient: a },
    ],
  });
}

/**
 * Add userId to my friends list and me to theirs (idempotent).
 */
async function linkFriends(userA, userB) {
  await User.updateOne(
    { _id: userA, friends: { $ne: userB } },
    { $addToSet: { friends: userB } }
  );
  await User.updateOne(
    { _id: userB, friends: { $ne: userA } },
    { $addToSet: { friends: userA } }
  );
}

/**
 * Remove each user from the other's friends list.
 */
async function unlinkFriends(userA, userB) {
  await User.updateOne({ _id: userA }, { $pull: { friends: userB } });
  await User.updateOne({ _id: userB }, { $pull: { friends: userA } });
}

exports.sendRequest = async (req, res, next) => {
  try {
    const { userId } = req.params;
    if (!isValidId(userId)) {
      return res.status(400).json({ success: false, message: "Invalid user id" });
    }
    if (userId === req.user._id.toString()) {
      return res.status(400).json({ success: false, message: "You can't friend yourself" });
    }

    const recipient = await User.findById(userId).select("name isActive");
    if (!recipient || !recipient.isActive) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    // Already friends?
    if (req.user.friends.some((f) => f.toString() === userId)) {
      return res.status(409).json({ success: false, message: "Already friends" });
    }

    const existing = await findPair(req.user._id, userId);

    if (existing) {
      // Blocked by either side
      if (existing.status === "blocked") {
        return res.status(403).json({ success: false, message: "Cannot send request" });
      }
      // Reverse pending → auto-accept
      if (
        existing.status === "pending" &&
        existing.recipient.toString() === req.user._id.toString()
      ) {
        existing.status = "accepted";
        existing.respondedAt = new Date();
        await existing.save();
        await linkFriends(existing.requester, existing.recipient);
        return res.json({ success: true, message: "Request auto-accepted", friendship: existing });
      }
      // Same-direction pending
      if (existing.status === "pending") {
        return res.status(409).json({ success: false, message: "Request already sent" });
      }
      // Was rejected before → re-open it
      if (existing.status === "rejected") {
        existing.requester = req.user._id;
        existing.recipient = userId;
        existing.status = "pending";
        existing.respondedAt = null;
        existing.blockedBy = null;
        await existing.save();
        return res.status(201).json({ success: true, friendship: existing });
      }
    }

    const friendship = await Friendship.create({
      requester: req.user._id,
      recipient: userId,
      status: "pending",
    });

    res.status(201).json({ success: true, friendship });
  } catch (err) {
    next(err)
  }
};

exports.acceptRequest = async (req, res, next) => {
  try {
    const { requestId } = req.params;
    if (!isValidId(requestId)) {
      return res.status(400).json({ success: false, message: "Invalid request id" });
    }

    const fs = await Friendship.findById(requestId);
    if (!fs) return res.status(404).json({ success: false, message: "Request not found" });

    if (fs.recipient.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: "Not your request" });
    }
    if (fs.status !== "pending") {
      return res.status(400).json({ success: false, message: `Request is ${fs.status}` });
    }

    fs.status = "accepted";
    fs.respondedAt = new Date();
    await fs.save();

    await linkFriends(fs.requester, fs.recipient);

    res.json({ success: true, friendship: fs });
  } catch (err) {
    next(err);
  }
};

exports.rejectRequest = async (req, res, next) => {
  try {
    const { requestId } = req.params;
    if (!isValidId(requestId)) {
      return res.status(400).json({ success: false, message: "Invalid request id" });
    }

    const fs = await Friendship.findById(requestId);
    if (!fs) return res.status(404).json({ success: false, message: "Request not found" });
    if (fs.recipient.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: "Not your request" });
    }
    if (fs.status !== "pending") {
      return res.status(400).json({ success: false, message: `Request is ${fs.status}` });
    }

    fs.status = "rejected";
    fs.respondedAt = new Date();
    await fs.save();

    res.json({ success: true, friendship: fs });
  } catch (err) {
    next(err);
  }
};

exports.unfriend = async (req, res, next) => {
  try {
    const { userId } = req.params;
    if (!isValidId(userId)) {
      return res.status(400).json({ success: false, message: "Invalid user id" });
    }

    const fs = await findPair(req.user._id, userId);
    if (!fs || fs.status !== "accepted") {
      return res.status(404).json({ success: false, message: "Not friends" });
    }

    await unlinkFriends(req.user._id, userId);
    await fs.deleteOne();

    res.json({ success: true, message: "Unfriended" });
  } catch (err) {
    next(err);
  }
};

exports.blockUser = async (req, res, next) => {
  try {
    const { userId } = req.params;
    if (!isValidId(userId)) {
      return res.status(400).json({ success: false, message: "Invalid user id" });
    }
    if (userId === req.user._id.toString()) {
      return res.status(400).json({ success: false, message: "You can't block yourself" });
    }

    const target = await User.findById(userId).select("_id");
    if (!target) return res.status(404).json({ success: false, message: "User not found" });

    // Remove friendship links in either direction
    await unlinkFriends(req.user._id, userId);

    let fs = await findPair(req.user._id, userId);
    if (!fs) {
      fs = new Friendship({
        requester: req.user._id,
        recipient: userId,
        status: "blocked",
        blockedBy: req.user._id,
      });
    } else {
      fs.status = "blocked";
      fs.blockedBy = req.user._id;
    }
    await fs.save();

    res.json({ success: true, friendship: fs });
  } catch (err) {
    next(err);
  }
};

exports.unblockUser = async (req, res, next) => {
  try {
    const { userId } = req.params;
    if (!isValidId(userId)) {
      return res.status(400).json({ success: false, message: "Invalid user id" });
    }

    const fs = await findPair(req.user._id, userId);
    if (!fs || fs.status !== "blocked") {
      return res.status(404).json({ success: false, message: "Not blocked" });
    }
    if (fs.blockedBy?.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: "You didn't block this user" });
    }

    await fs.deleteOne();
    res.json({ success: true, message: "Unblocked" });
  } catch (err) {
    next(err);
  }
};

exports.listFriends = async (req, res, next) => {
  try {
    const me = await User.findById(req.user._id)
      .populate("friends", "name email avatar bio preferredLanguage lastSeenAt")
      .select("friends");

    res.json({ success: true, count: me.friends.length, friends: me.friends });
  } catch (err) {
    next(err);
  }
};

exports.listRequests = async (req, res, next) => {
  try {
    const [incoming, outgoing] = await Promise.all([
      Friendship.find({ recipient: req.user._id, status: "pending" })
        .populate("requester", "name email avatar bio")
        .sort("-createdAt"),
      Friendship.find({ requester: req.user._id, status: "pending" })
        .populate("recipient", "name email avatar bio")
        .sort("-createdAt"),
    ]);

    res.json({ success: true, incoming, outgoing });
  } catch (err) {
    next(err);
  }
};

exports.listBlocked = async (req, res, next) => {
  try {
    const blocked = await Friendship.find({
      status: "blocked",
      blockedBy: req.user._id,
    }).populate("recipient", "name email avatar");

    res.json({ success: true, count: blocked.length, blocked });
  } catch (err) {
    next(err);
  }
};

// Handy for a profile page: tells frontend what buttons to render.
exports.getStatus = async (req, res, next) => {
  try {
    const { userId } = req.params;
    if (!isValidId(userId)) {
      return res.status(400).json({ success: false, message: "Invalid user id" });
    }

    if (userId === req.user._id.toString()) {
      return res.json({ success: true, status: "self" });
    }

    const isFriend = req.user.friends.some((f) => f.toString() === userId);
    if (isFriend) return res.json({ success: true, status: "friends" });

    const fs = await findPair(req.user._id, userId);
    if (!fs) return res.json({ success: true, status: "none" });

    if (fs.status === "blocked") {
      const iBlocked = fs.blockedBy?.toString() === req.user._id.toString();
      return res.json({ success: true, status: iBlocked ? "blocked-by-me" : "blocked-me" });
    }

    if (fs.status === "pending") {
      const sent = fs.requester.toString() === req.user._id.toString();
      return res.json({
        success: true,
        status: sent ? "pending-outgoing" : "pending-incoming",
        requestId: fs._id,
      });
    }

    return res.json({ success: true, status: fs.status });
  } catch (err) {
    next(err);
  }
};