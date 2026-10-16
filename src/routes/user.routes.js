const express = require("express");
const router = express.Router();

const {
	getMyProfile,
	updateMyProfile,
	updateAvatar,
	removeAvatar,
	searchUsers,
	getUserById,
} = require("../controller/user.controller");
const { protect } = require("../middlewares/auth.middleware");
const upload = require("../middlewares/upload");

// All routes here require authentication
router.use(protect);

router.get("/search", searchUsers);

router.get("/me", getMyProfile);
router.put("/me", updateMyProfile);
router.put("/me/avatar", upload.single("avatar"), updateAvatar);
router.delete("/me/avatar", removeAvatar);

router.get("/:id", getUserById);

module.exports = router;
