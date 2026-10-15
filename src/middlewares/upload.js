const multer = require("multer");

const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/gif"];

const storage = multer.memoryStorage();

const upload = multer({
	storage,
	limits: { fileSize: 5 * 1024 * 1024 }, // 5mb
	fileFilter: (req, file, cb) => {
		if (!ALLOWED) {
			return cb(new Error("Only JPG, PNG, WEBP, or GIF images are allowed"));
		}
		cb(null, true);
	},
});

module.exports = upload;
