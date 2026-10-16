const { Note } = require("../models/note.model");
const {Friendship} = require("../models/friendship.model")

const { validate } = require("../utils/validators");
const { assertShareableFriend } = require("../utils/noteAccess");
const { LANGUAGE_CODES } = require("../utils/languages");
const {
	loadReadableNote,
	loadEditableNote,
	getFriendIds,
} = require("../utils/noteAccess");

function normalizeTags(tags) {
	if (!Array.isArray(tags)) return [];
	const cleaned = tags
		.map((t) => String(t).trim().toLowerCase())
		.filter(Boolean);
	return [...new Set(cleaned)].slice(0, 20);
}

exports.createNote = async (req, res, next) => {
	try {
		const rules = {
			title: { type: "string", max: 150 },
			content: { type: "string", max: 100000 },
			lang: { type: "string", enum: LANGUAGE_CODES },
			durationSec: { type: "number" },
			visibility: { type: "string", enum: ["private", "friends", "shared"] },
			isPinned: { type: "boolean" },
		};
		const { ok, errors } = validate(req.body, rules);
		if (!ok) return res.status(400).json({ success: false, errors });

		const {
			title = "Untitled note",
			content = "",
			lang = req.user.preferredLanguage || "en-US",
			durationSec = 0,
			visibility = "private",
			tags = [],
			isPinned = false,
		} = req.body;

		const note = await Note.create({
			owner: req.user._id,
			title: title.trim() || "Untitled note",
			content,
			lang,
			durationSec: Number(durationSec) || 0,
			visibility,
			tags: normalizeTags(tags),
			isPinned: Boolean(isPinned),
		});

		// Track language usage (for quick-switch UX)
		const prev = req.user.recentLanguages || [];
		if (!prev.includes(lang)) {
			req.user.recentLanguages = [lang, ...prev].slice(0, 5);
			await req.user.save({ validateBeforeSave: false });
		}

		res.status(201).json({ success: true, note });
	} catch (err) {
		next(err);
	}
};

// Query params: q, language, visibility, tag, archived, pinned, sort, page, limit
exports.listMyNotes = async (req, res, next) => {
	try {
		const {
			q,
			lang,
			visibility,
			tag,
			archived = "false",
			pinned,
			sort = "-updatedAt",
			page = 1,
			limit = 20,
		} = req.query;

		const query = {
			owner: req.user._id,
			isDeleted: false,
		};

		if (archived === "true") query.isArchived = true;
		else if (archived === "false") query.isArchived = false;

		if (lang) query.lang = lang;
		if (visibility) query.visibility = visibility;
		if (tag) query.tags = String(tag).toLowerCase();
		if (pinned === "true") query.isPinned = true;
		if (pinned === "false") query.isPinned = false;

		if (q && q.trim().length >= 2) {
			query.$text = { $search: q.trim() };
		}

		// Whitelist sort fields to prevent weird values
		const allowedSorts = [
			"-updatedAt",
			"updatedAt",
			"-createdAt",
			"createdAt",
			"-wordCount",
			"wordCount",
			"title",
			"-title",
		];
		const sortKey = allowedSorts.includes(sort) ? sort : "-updatedAt";

		const pageNum = Math.max(1, parseInt(page, 10) || 1);
		const pageSize = Math.min(50, Math.max(1, parseInt(limit, 10) || 20));
		const skip = (pageNum - 1) * pageSize;

		const [items, total] = await Promise.all([
			Note.find(query)
				.sort(sortKey)
				.skip(skip)
				.limit(pageSize)
				.select("-sharedWith") // don't leak sharing list in list view
				.lean(),
			Note.countDocuments(query),
		]);

		res.json({
			success: true,
			count: items.length,
			total,
			page: pageNum,
			pages: Math.ceil(total / pageSize) || 1,
			notes: items,
		});
	} catch (err) {
		next(err);
	}
};

exports.getNote = async (req, res, next) => {
	try {
		const note = await loadReadableNote(req.params.id, req.user);

		// Determine role for frontend
		const uid = req.user._id.toString();
		let role = "viewer";
		if (note.owner.toString() === uid) role = "owner";
		else if (note.canBeEditedBy(req.user._id)) role = "editor";

		// Populate owner profile (name + avatar only)
		const populated = await Note.findById(note._id)
			.populate("owner", "name avatar preferredLanguage")
			.populate("sharedWith.user", "name avatar");

		res.json({ success: true, note: populated, role });
	} catch (err) {
		if (err.status)
			return res
				.status(err.status)
				.json({ success: false, message: err.message });
		next(err);
	}
};

exports.updateNote = async (req, res, next) => {
	try {
		const note = await loadEditableNote(req.params.id, req.user);

		const rules = {
			title: { type: "string", max: 150 },
			content: { type: "string", max: 100000 },
			lang: { type: "string", enum: LANGUAGE_CODES },
			durationSec: { type: "number" },
			visibility: { type: "string", enum: ["private", "friends", "shared"] },
			isPinned: { type: "boolean" },
			isArchived: { type: "boolean" },
		};
		const { ok, errors } = validate(req.body, rules);
		if (!ok) return res.status(400).json({ success: false, errors });

		const fields = [
			"title",
			"content",
			"lang",
			"durationSec",
			"visibility",
			"isPinned",
			"isArchived",
		];

		for (const f of fields) {
			if (req.body[f] !== undefined) {
				if (f === "title") {
					const t = String(req.body.title).trim();
					note.title = t || "Untitled note";
				} else if (f === "durationSec") {
					note.durationSec = Math.max(0, Number(req.body.durationSec) || 0);
				} else {
					note[f] = req.body[f];
				}
			}
		}

		if (req.body.tags !== undefined) {
			note.tags = normalizeTags(req.body.tags);
		}

		// If visibility changed away from "shared", clear sharing list
		if (note.visibility !== "shared" && note.sharedWith.length) {
			note.sharedWith = [];
		}

		await note.save();
		res.json({ success: true, note });
	} catch (err) {
		if (err.status)
			return res
				.status(err.status)
				.json({ success: false, message: err.message });
		next(err);
	}
};

// Soft delete
exports.deleteNote = async (req, res, next) => {
	try {
		const note = await loadEditableNote(req.params.id, req.user);
		note.isDeleted = true;
		await note.save();
		res.json({ success: true, message: "Note moved to trash" });
	} catch (err) {
		if (err.status)
			return res
				.status(err.status)
				.json({ success: false, message: err.message });
		next(err);
	}
};

exports.restoreNote = async (req, res, next) => {
	try {
		// Owner-only restore
		const note = await Note.findById(req.params.id);
		if (!note)
			return res
				.status(404)
				.json({ success: false, message: "Note not found" });
		if (note.owner.toString() !== req.user._id.toString()) {
			return res
				.status(403)
				.json({ success: false, message: "Only the owner can restore" });
		}
		note.isDeleted = false;
		await note.save();
		res.json({ success: true, note });
	} catch (err) {
		next(err);
	}
};

exports.hardDeleteNote = async (req, res, next) => {
	try {
		const note = await Note.findById(req.params.id);
		if (!note)
			return res
				.status(404)
				.json({ success: false, message: "Note not found" });
		if (note.owner.toString() !== req.user._id.toString()) {
			return res.status(403).json({
				success: false,
				message: "Only the owner can permanently delete",
			});
		}
		await note.deleteOne();
		res.json({ success: true, message: "Note permanently deleted" });
	} catch (err) {
		next(err);
	}
};

exports.listTrash = async (req, res, next) => {
	try {
		const notes = await Note.find({
			owner: req.user._id,
			isDeleted: true,
		})
			.sort("-updatedAt")
			.limit(100)
			.select("title lang updatedAt wordCount");
		res.json({ success: true, count: notes.length, notes });
	} catch (err) {
		next(err);
	}
};

// Notes whose visibility === "friends" AND owner is my friend,
// OR notes in "sharedWith" containing me.
exports.friendFeed = async (req, res, next) => {
	try {
		const friendIds = await getFriendIds(req.user._id);
		const friendList = [...friendIds];

		const blockedPairs = await Friendship.find({
			status: "blocked",
			$or: [{ requester: req.user._id }, { recipient: req.user._id }],
		}).select("requester recipient");

		const blockedIds = new Set(
			blockedPairs.map((b) =>
				(b.requester.toString() === req.user._id.toString()
					? b.recipient
					: b.requester
				).toString(),
			),
		);

		const feedOwnerIds = [...friendIds].filter((id) => !blockedIds.has(id));

		const notes = await Note.find({
			isDeleted: false,
			isArchived: false,
			owner: { $in: feedOwnerIds },
			$or: [
				{ visibility: "friends" },
				{ visibility: "shared", "sharedWith.user": req.user._id },
			],
		})
			.sort("-updatedAt")
			.limit(50)
			.populate("owner", "name avatar preferredLanguage")
			.select("-sharedWith");

		res.json({ success: true, count: notes.length, notes });
	} catch (err) {
		next(err);
	}
};

// Body: { userId, permission = "view" }
exports.shareNote = async (req, res, next) => {
  try {
    const { userId, permission = "view" } = req.body || {};

    if (!userId) {
      return res.status(400).json({ success: false, message: "userId is required" });
    }
    if (!["view", "edit"].includes(permission)) {
      return res
        .status(400)
        .json({ success: false, message: "permission must be 'view' or 'edit'" });
    }

    // Only the owner can share
    const note = await Note.findById(req.params.id);
    if (!note || note.isDeleted) {
      return res.status(404).json({ success: false, message: "Note not found" });
    }
    if (note.owner.toString() !== req.user._id.toString()) {
      return res
        .status(403)
        .json({ success: false, message: "Only the owner can share this note" });
    }

    // Validate the target is a friend (and not blocked)
    let target;
    try {
      target = await assertShareableFriend(req.user, userId);
    } catch (e) {
      return res.status(e.status || 400).json({ success: false, message: e.message });
    }

    // Upsert into sharedWith
    const existing = note.sharedWith.find((s) => s.user.toString() === userId);

    if (existing) {
      existing.permission = permission;
      existing.sharedAt = new Date();
    } else {
      note.sharedWith.push({ user: userId, permission });
    }

    // Auto-flip visibility if not already "shared"
    if (note.visibility !== "shared") {
      note.visibility = "shared";
    }

    await note.save();

    // Return the freshly populated note
    const populated = await Note.findById(note._id)
      .populate("owner", "name avatar preferredLanguage")
      .populate("sharedWith.user", "name avatar email");

    res.json({
      success: true,
      message: existing ? "Share updated" : "Note shared",
      note: populated,
    });
  } catch (err) {
    next(err);
  }
};

// Body: { permission }
exports.updateSharePermission = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { permission } = req.body || {};

    if (!["view", "edit"].includes(permission)) {
      return res
        .status(400)
        .json({ success: false, message: "permission must be 'view' or 'edit'" });
    }

    const note = await Note.findById(req.params.id);
    if (!note || note.isDeleted) {
      return res.status(404).json({ success: false, message: "Note not found" });
    }
    if (note.owner.toString() !== req.user._id.toString()) {
      return res
        .status(403)
        .json({ success: false, message: "Only the owner can change permissions" });
    }

    const entry = note.sharedWith.find((s) => s.user.toString() === userId);
    if (!entry) {
      return res
        .status(404)
        .json({ success: false, message: "This note is not shared with that user" });
    }

    entry.permission = permission;
    await note.save();

    res.json({ success: true, message: "Permission updated", sharedWith: note.sharedWith });
  } catch (err) {
    next(err);
  }
};

exports.revokeShare = async (req, res, next) => {
  try {
    const { userId } = req.params;

    const note = await Note.findById(req.params.id);
    if (!note || note.isDeleted) {
      return res.status(404).json({ success: false, message: "Note not found" });
    }

    // Owner can revoke anyone; a shared user can revoke themselves ("leave")
    const isOwner = note.owner.toString() === req.user._id.toString();
    const isSelf = userId === req.user._id.toString();

    if (!isOwner && !isSelf) {
      return res
        .status(403)
        .json({ success: false, message: "Only the owner can revoke access" });
    }

    const before = note.sharedWith.length;
    note.sharedWith = note.sharedWith.filter((s) => s.user.toString() !== userId);

    if (note.sharedWith.length === before) {
      return res
        .status(404)
        .json({ success: false, message: "This note is not shared with that user" });
    }

    // If no shares remain, revert visibility
    if (note.sharedWith.length === 0) {
      note.visibility = "private";
    }

    await note.save();

    res.json({
      success: true,
      message: isSelf && !isOwner ? "You left this note" : "Access revoked",
      sharedWith: note.sharedWith,
      visibility: note.visibility,
    });
  } catch (err) {
    next(err);
  }
};

exports.listShares = async (req, res, next) => {
  try {
    const note = await Note.findById(req.params.id)
      .populate("sharedWith.user", "name email avatar preferredLanguage");

    if (!note || note.isDeleted) {
      return res.status(404).json({ success: false, message: "Note not found" });
    }
    if (note.owner.toString() !== req.user._id.toString()) {
      return res
        .status(403)
        .json({ success: false, message: "Only the owner can view the share list" });
    }

    res.json({
      success: true,
      count: note.sharedWith.length,
      visibility: note.visibility,
      sharedWith: note.sharedWith,
    });
  } catch (err) {
    next(err);
  }
};

exports.sharedWithMe = async (req, res, next) => {
  try {
    const notes = await Note.find({
      isDeleted: false,
      isArchived: false,
      "sharedWith.user": req.user._id,
    })
      .sort("-updatedAt")
      .limit(50)
      .populate("owner", "name avatar preferredLanguage")
      .select("title lang wordCount visibility updatedAt owner durationSec");

    res.json({ success: true, count: notes.length, notes });
  } catch (err) {
    next(err);
  }
};