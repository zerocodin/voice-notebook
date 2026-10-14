const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const { LANGUAGE_CODES } = require("../utils/languages");

const imageScheam = new mongoose.Schema(
	{
		url: {
			type: String,
			required: true,
		},
		fileId: {
			type: String,
			required: true,
		},
	},
	{ _id: false },
);

const userSchema = new mongoose.Schema(
	{
		name: {
			type: String,
			required: [true, "Name is required"],
			trim: true,
			minlength: 3,
			maxlength: 60,
		},
		email: {
			type: String,
			required: [true, "Email is required"],
			unique: true,
			lowercase: true,
			trim: true,
			match: [/^\S+@\S+\.\S+$/, "Please provide a valid email"],
		},
		password: {
			type: String,
			required: [true, "Password is required"],
			minlength: 6,
			select: false,
		},
		avatar: {
			type: imageScheam,
			default: null,
		},
		bio: {
			type: String,
			maxlength: 200,
			default: "",
		},
		preferredLanguage: {
			type: String,
			enum: LANGUAGE_CODES,
			default: "en-US",
		},
		// Denormalized list of accepted friend IDs for fast lookups
		friends: [
			{
				type: mongoose.Schema.Types.ObjectId,
				ref: "User",
			},
		],
		// Recent languages used (for quick switching in UI)
		recentLanguages: [
			{
				type: String,
				enum: LANGUAGE_CODES,
			},
		],
		isVerified: {
			type: Boolean,
			default: false,
		},
		isActive: {
			type: Boolean,
			default: true,
		},
		lastSeenAt: {
			type: Date,
			default: Date.now,
		},
	},
	{ timestamps: true },
);

// indexes
userSchema.index({name:"text"})
userSchema.index({friends:1})

// hash password
userSchema.pre("save", async function () {
  if (!this.isModified("password")) return;
  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
});

// compare password
userSchema.methods.matchPassword = async function (entered) {
  return bcrypt.compare(entered, this.password);
};

// Safe public shape
userSchema.methods.toPublicJSON = function () {
  return {
    _id: this._id,
    name: this.name,
    email: this.email,
    avatar: this.avatar,
    bio: this.bio,
    preferredLanguage: this.preferredLanguage,
    recentLanguages: this.recentLanguages,
    friends: this.friends,
    createdAt: this.createdAt,
  };
};

module.exports = mongoose.model("user", userSchema);