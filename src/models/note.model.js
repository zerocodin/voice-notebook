const mongoose = require("mongoose");
const { LANGUAGE_CODES } = require("../utils/languages");

const imageSchema = new mongoose.Schema(
	{
		url: { type: String, required: true },
		fileId: { type: String, required: true },
		thumbnailUrl: { type: String },
	},
	{ _id: false },
);

const shareEntrySchema = new mongoose.Schema(
	{
		user: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "user",
			required: true,
		},
		permission: {
			type: String,
			enum: ["view", "edit"],
			default: "view",
		},
		sharedAt: { type: Date, default: Date.now },
	},
	{ _id: false },
);

const noteSchema = new mongoose.Schema(
	{
		owner: {
			type: mongoose.Schema.Types.ObjectId,
			ref: "user",
			required: true,
			index: true,
		},
		title: {
			type: String,
			trim: true,
			maxlength: 150,
			default: "Untitled note",
		},
		content: {
			type: String,
			default: "",
			maxlength: 100000, // ~100k chars per note
		},
		lang: {
			type: String,
			enum: LANGUAGE_CODES,
			default: "en-US",
			index: true,
		},
		durationSec: {
			type: Number,
			default: 0,
			min: 0,
		},
		wordCount: {
			type: Number,
			default: 0,
			min: 0,
		},
		tags: {
			type: [String],
			default: [],
			validate: {
				validator: (arr) => arr.length <= 20,
				message: "Too many tags (max 20)",
			},
		},
		visibility: {
			type: String,
			enum: ["private", "friends", "shared"],
			default: "private",
			index: true,
		},
		// Used only when visibility === "shared"
		sharedWith: {
			type: [shareEntrySchema],
			default: [],
		},
		attachments: {
			type: [imageSchema],
			default: [],
		},
		isPinned: {
			type: Boolean,
			default: false,
		},
		isArchived: {
			type: Boolean,
			default: false,
		},
		isDeleted: {
			type: Boolean,
			default: false, // soft delete
		},
	},
	{ timestamps: true },
);

// Compound indexes for common queries
noteSchema.index({ owner: 1, isDeleted: 1, updatedAt: -1 });
noteSchema.index({ owner: 1, visibility: 1 });
noteSchema.index({ "sharedWith.user": 1 });
noteSchema.index({ title: "text", content: "text", tags: "text" });

// Auto-compute wordCount before save
noteSchema.pre("save", function () {
  if (this.isModified("content")) {
    const trimmed = (this.content || "").trim();
    this.wordCount = trimmed ? trimmed.split(/\s+/).length : 0;
  }
});

// Helper: check if a given user can read this note
noteSchema.methods.canBeReadBy = function (userId) {
  const uid = userId.toString();
  if (this.owner.toString() === uid) return true;
  if (this.visibility === "friends") return true; // caller must already be a friend
  if (
    this.visibility === "shared" &&
    this.sharedWith.some((s) => s.user.toString() === uid)
  )
    return true;
  return false;
};

// Helper: check if user can edit
noteSchema.methods.canBeEditedBy = function (userId) {
  const uid = userId.toString();
  if (this.owner.toString() === uid) return true;
  if (this.visibility === "shared") {
    return this.sharedWith.some(
      (s) => s.user.toString() === uid && s.permission === "edit"
    );
  }
  return false;
};

const Note = mongoose.model("note", noteSchema);
module.exports = {Note}