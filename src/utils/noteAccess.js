const { Note } = require("../models/note.model");
const { User } = require("../models/user.model");
const { Friendship } = require("../models/friendship.model");

/**
 * Load a note by id and enforce that `userId` is allowed to read it.
 * Throws an object { status, message } on failure — caught by controller.
 */
async function loadReadableNote(noteId, user) {
	if (!/^[0-9a-fA-F]{24}$/.test(noteId)) {
		throw { status: 400, message: "Invalid note id" };
	}

	const note = await Note.findById(noteId);
	if (!note || note.isDeleted) {
		throw { status: 404, message: "Note not found" };
	}

	const uid = user._id.toString();
	const ownerId = note.owner.toString();

	if (ownerId === uid) return note;

	// Blocked check — in either direction
	const block = await Friendship.findOne({
		status: "blocked",
		$or: [
			{ requester: uid, recipient: ownerId },
			{ requester: ownerId, recipient: uid },
		],
	});
	if (block) throw { status: 404, message: "Note not found" };

	if (note.visibility === "friends") {
		const isFriend = user.friends.some((f) => f.toString() === ownerId);
		if (isFriend) return note;
	}

	if (note.visibility === "shared") {
		const entry = note.sharedWith.find((s) => s.user.toString() === uid);
		if (entry) return note;
	}

	throw { status: 404, message: "Note not found" };
}

// (loadEditableNote and getFriendIds unchanged)

async function loadEditableNote(noteId, user) {
	const note = await loadReadableNote(noteId, user);
	if (!note.canBeEditedBy(user._id)) {
		throw {
			status: 403,
			message: "You do not have permission to edit this note",
		};
	}
	return note;
}

async function getFriendIds(userId) {
	const user = await User.findById(userId).select("friends");
	return new Set((user?.friends || []).map((f) => f.toString()));
}

/**
 * Ensure `targetUserId` is a valid friend of `ownerId`, and neither
 * side has blocked the other.
 * Throws { status, message } on failure.
 */
async function assertShareableFriend(ownerUser, targetUserId) {
	const targetId = targetUserId.toString();
	const ownerId = ownerUser._id.toString();

	if (targetId === ownerId) {
		throw { status: 400, message: "You can't share a note with yourself" };
	}

	// Must be a direct friend
	const isFriend = ownerUser.friends.some((f) => f.toString() === targetId);
	if (!isFriend) {
		throw { status: 403, message: "You can only share notes with friends" };
	}

	// No blocks in either direction
	const block = await Friendship.findOne({
		status: "blocked",
		$or: [
			{ requester: ownerId, recipient: targetId },
			{ requester: targetId, recipient: ownerId },
		],
	});
	if (block) {
		throw { status: 403, message: "Cannot share with this user" };
	}

	// Does the target user actually exist and is active?
	const target = await User.findById(targetId).select(
		"_id isActive name avatar",
	);
	if (!target || !target.isActive) {
		throw { status: 404, message: "User not found" };
	}

	return target;
}

module.exports = {
	loadReadableNote,
	loadEditableNote,
	getFriendIds,
	assertShareableFriend,
};
