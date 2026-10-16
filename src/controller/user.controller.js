const { User } = require("../models/user.model");
const { validate } = require("../utils/validators");
const { uploadBuffer, deleteFile } = require("../utils/imagekitUpload");
const { LANGUAGE_CODES } = require("../utils/languages");

exports.getMyProfile = async (req, res) => {
	// req.user already set by protect middleware
	res.json({ success: true, user: req.user.toPublicJSON() });
};

exports.updateMyProfile = async (req, res, next) => {
	try {
		const rules = {
			name: { type: "string", min: 3, max: 60 },
			bio: { type: "string", max: 200 },
			preferredLanguage: { type: "string", enum: LANGUAGE_CODES },
		};
		const { ok, errors } = validate(req.body, rules);
		if (!ok) return res.status(400).json({ success: false, errors });

		const updates = {};
		if (req.body.name !== undefined) updates.name = req.body.name.trim();
		if (req.body.bio !== undefined) updates.bio = req.body.bio.trim();
		if (req.body.preferredLanguage !== undefined) {
			updates.preferredLanguage = req.body.preferredLanguage;

			// Track "recentLanguages" — most-recent-first, dedup, max 5
			const prev = req.user.recentLanguages || [];
			const merged = [
				req.body.preferredLanguage,
				...prev.filter((l) => l !== req.body.preferredLanguage),
			].slice(0, 5);
			updates.recentLanguages = merged;
		}

		const user = await User.findByIdAndUpdate(req.user._id, updates, {
			new: true,
			runValidators: true,
		}).select("-password");

		res.json({ success: true, user: user.toPublicJSON() });
	} catch (err) {
		next(err);
	}
};

/*   PUT /api/users/me/avatar  */
exports.updateAvatar = async (req, res, next) => {
	try {
		if (!req.file) {
			return res
				.status(400)
				.json({ success: false, message: "No image uploaded" });
		}

		// Remember old fileId so we can delete after successful upload
		const oldFileId = req.user.avatar?.fileId;

		const uploaded = await uploadBuffer(req.file.buffer, {
			fileName: `avatar-${req.user._id}-${Date.now()}`,
			folder: "/voice-notes/avatars",
		});

		req.user.avatar = {
			url: uploaded.url,
			thumbnailUrl: uploaded.thumbnailUrl,
			fileId: uploaded.fileId,
		};
		await req.user.save({ validateBeforeSave: false });

		// Delete the old avatar AFTER we've saved the new one
		await deleteFile(oldFileId);

		res.json({
			success: true,
			avatar: req.user.avatar,
			user: req.user.toPublicJSON(),
		});
	} catch (err) {
		next(err);
	}
};

/*  DELETE /api/users/me/avatar  */
exports.removeAvatar = async (req, res, next) => {
	try {
		const oldFileId = req.user.avatar?.fileId;
		req.user.avatar = null;
		await req.user.save({ validateBeforeSave: false });
		await deleteFile(oldFileId);
		res.json({ success: true, message: "Avatar removed" });
	} catch (err) {
		next(err);
	}
};

/*  GET /api/users/search?q=  */
exports.searchUsers = async (req, res, next) => {
	try {
		const q = (req.query.q || "").trim();
		if (q.length < 2) {
			return res
				.status(400)
				.json({
					success: false,
					message: "Query must be at least 2 characters",
				});
		}

		// Escape regex special chars
		const safe = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		const regex = new RegExp(safe, "i");

		// Exclude self
		const users = await User.find({
			_id: { $ne: req.user._id },
			isActive: true,
			$or: [{ name: regex }, { email: regex }],
		})
			.select("name email avatar bio preferredLanguage")
			.limit(20);

		res.json({ success: true, users });
	} catch (err) {
		next(err);
	}
};

/*   GET /api/users/:id   */
exports.getUserById = async (req, res, next) => {
	try {
		const { id } = req.params;

		// Basic ObjectId sanity check
		if (!/^[0-9a-fA-F]{24}$/.test(id)) {
			return res.status(400).json({ success: false, message: "Invalid id" });
		}

		const user = await User.findById(id).select(
			"name avatar bio preferredLanguage friends createdAt lastSeenAt",
		);
		if (!user) {
			return res
				.status(404)
				.json({ success: false, message: "User not found" });
		}

		// Privacy: hide email unless it's yourself or a friend
		const isSelf = req.user._id.toString() === id;
		const isFriend = req.user.friends.some((f) => f.toString() === id);

		const payload = {
			_id: user._id,
			name: user.name,
			avatar: user.avatar,
			bio: user.bio,
			preferredLanguage: user.preferredLanguage,
			createdAt: user.createdAt,
			lastSeenAt: user.lastSeenAt,
			friendCount: user.friends.length,
			isSelf,
			isFriend,
		};
		if (isSelf || isFriend) payload.email = user.email;

		res.json({ success: true, user: payload });
	} catch (err) {
		next(err);
	}
};
