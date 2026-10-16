const express = require("express");
const router = express.Router();
const {
  sendRequest,
  acceptRequest,
  rejectRequest,
  unfriend,
  blockUser,
  unblockUser,
  listFriends,
  listRequests,
  listBlocked,
  getStatus,
} = require("../controller/friend.controller");
const { protect } = require("../middlewares/auth.middleware");

router.use(protect);

// Static paths before params
router.get("/", listFriends);
router.get("/requests", listRequests);
router.get("/blocked", listBlocked);
router.get("/status/:userId", getStatus);

router.post("/request/:userId", sendRequest);
router.post("/accept/:requestId", acceptRequest);
router.post("/reject/:requestId", rejectRequest);

router.delete("/:userId", unfriend);
router.post("/block/:userId", blockUser);
router.delete("/block/:userId", unblockUser);

module.exports = router;