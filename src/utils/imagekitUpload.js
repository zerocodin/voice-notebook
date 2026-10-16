const imagekit = require("../services/imagekit");

async function uploadBuffer(buffer, { fileName, folder = "/voice-notes" }) {
	const res = await imagekit.upload({
		file: buffer, // Buffer or base64 — ImageKit accepts buffers
		fileName,
		folder,
		useUniqueFileName: true,
	});

	return {
		url: res.url,
		thumbnailUrl: res.thumbnailUrl,
		fileId: res.fileId,
		name: res.name,
		size: res.size,
	};
}

/**
 * Delete a file from ImageKit by fileId.
 * Safe to call with null/undefined — resolves silently.
 */
async function deleteFile(fileId) {
	if (!fileId) return;
	try {
		await imagekit.deleteFile(fileId);
	} catch (err) {
		// Don't fail the request if the old file is already gone
		console.warn(`ImageKit delete failed for ${fileId}:`, err.message);
	}
}

module.exports = { uploadBuffer, deleteFile };
