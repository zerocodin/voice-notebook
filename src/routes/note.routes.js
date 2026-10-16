const express = require("express");
const router = express.Router();
const {
	createNote,
	listMyNotes,
	getNote,
	updateNote,
	deleteNote,
	restoreNote,
	hardDeleteNote,
	listTrash,
	friendFeed,
	shareNote,
	updateSharePermission,
	revokeShare,
	listShares,
	sharedWithMe
} = require("../controller/note.controller");
const { protect } = require("../middlewares/auth.middleware");

router.use(protect);

router.get("/shared-with-me", sharedWithMe);

// static
router.get("/trash", listTrash);
router.get("/feed", friendFeed);

// create note
router.route("/").get(listMyNotes).post(createNote);

// Sharing sub-routes
router.get("/:id/shares", listShares);
router.post("/:id/share", shareNote);
router.patch("/:id/share/:userId", updateSharePermission);
router.delete("/:id/share/:userId", revokeShare);


// note details
router.route("/:id").get(getNote).patch(updateNote).delete(deleteNote);

router.post("/:id/restore", restoreNote);
router.delete("/:id/hard", hardDeleteNote);

module.exports = router;
