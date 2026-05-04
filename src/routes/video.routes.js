import { Router } from "express";
import {
  deleteVideo,
  getVideoById,
  getVideos,
  publishAVideo,
  togglePublishStatus,
  updateVideo,
} from "../controllers/video.controller.js";
import {
  optionalVerifyJWT,
  verifyJWT,
} from "../middlewares/auth.middleware.js";
import { upload } from "../middlewares/multer.middleware.js";

const router = Router();

router.route("/videos").get(getVideos);
router.route("/:videoId").get(optionalVerifyJWT, getVideoById);

//protectedRoutes
router
  .route("/publish-video")
  .post(verifyJWT, upload.single("thumbnail"), publishAVideo);

router
  .route("/update/:videoId")
  .patch(verifyJWT, upload.single("thumbnail"), updateVideo);

router.route("/delete/:videoId").delete(verifyJWT, deleteVideo);

router
  .route("/toggle-publishStatus/:videoId")
  .patch(verifyJWT, togglePublishStatus);
export default router;
