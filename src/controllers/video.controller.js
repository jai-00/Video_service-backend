import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { Video } from "../models/video.model.js";
import {
  deleteFromCloudinary,
  uploadOnCloudinary,
} from "../utils/cloudinary.js";

const getVideos = asyncHandler(async (req, res) => {
  const { page = 1, limit = 10, query, sortBy, sortType, userId } = req.query;

  let pageNumber = parseInt(page, 10);
  let limitNumber = parseInt(limit, 10);

  if (!pageNumber || !limitNumber || limitNumber <= 0) {
    throw new ApiError(400, "Bad request");
  }

  if (pageNumber > 100) {
    pageNumber = 100;
  }

  if (limitNumber > 20) {
    limitNumber = 20;
  }

  let filter = {};

  if (query) {
    filter.title = { $regex: query, $options: "i" };
  }

  if (userId) {
    filter.owner = userId;
  }

  const allowedFields = ["createdAt", "views"];
  const sort = {};

  if (sortBy && allowedFields.includes(sortBy)) {
    sort[sortBy] = sortType === "asc" ? 1 : -1;
  } else {
    sort.createdAt = -1;
  }

  const videos = await Video.find(filter)
    .sort(sort)
    .skip((pageNumber - 1) * limitNumber)
    .limit(limitNumber)
    .select("-description");

  return res
    .status(200)
    .json(new ApiResponse(200, videos, "Videos fetched successfully"));
});

const publishAVideo = asyncHandler(async (req, res) => {
  const { url, publicId, title, description = "", duration } = req.body;
  const owner = req.user;
  if (!url || !publicId || !duration) {
    throw new ApiError(400, "Video file missing");
  }

  // if (!publicId || !url) {
  //   throw new ApiError(400, "Video file missing");
  // }

  if (!title) {
    throw new ApiError(400, "Title of the video missing");
  }

  if (!owner) {
    throw new ApiError(401, "User not authorized");
  }

  const localThumbnailPath = req.file?.path;

  if (!localThumbnailPath) {
    throw new ApiError(400, "Thumbnail file missing");
  }

  const uploaded = await uploadOnCloudinary(localThumbnailPath);
  console.log("uploaded thumbnail data: ", uploaded);
  if (!uploaded) {
    throw new ApiError(500, "Uploading the thumbnail failed");
  }

  const videoUpload = await Video.create({
    videoFile: {
      url,
      public_id: publicId,
    },
    thumbnail: {
      url: uploaded?.url,
      public_id: uploaded?.public_id,
    },
    title,
    description,
    duration: duration,
    views: 0,
    isPublished: true,
    owner: owner._id,
  });

  if (!videoUpload) {
    throw new ApiError(500, "Error uploading video to database");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, videoUpload, "Video uploaded successfully"));
});

const getVideoById = asyncHandler(async (req, res) => {
  const { videoId } = req.params;

  if (!videoId) {
    throw new ApiError(400, "Video id missing");
  }

  const video = await Video.findById(videoId);

  if (!video) {
    throw new ApiError(400, "No such video found");
  }
  return res
    .status(200)
    .json(new ApiResponse(200, video, "Specified video fetched successfully"));
});

const updateVideo = asyncHandler(async (req, res) => {
  const { videoId } = req.params;
  const { title, description } = req.body;
  const user = req.user;
  const thumbnailLocalFilePath = req.file?.path;

  if (!videoId) {
    throw new ApiError(400, "Video ID not found");
  }

  if (!title && !description && !thumbnailLocalFilePath) {
    throw new ApiError(400, "No new data to update");
  }

  if (!user) {
    throw new ApiError(400, "Unauthorized request");
  }

  const video = await Video.findById(videoId);

  if (!video) {
    throw new ApiError(400, "Requested video file not found");
  }
  const oldThumbnail = video?.thumbnail;
  console.log("video owner: ", video?.owner);
  console.log("request owner: ", user?._id);

  if (video?.owner.toString() !== user?._id.toString()) {
    throw new ApiError(403, "Requested action cannot be performed by the user");
  }

  let thumbnailObject = video.thumbnail;

  if (thumbnailLocalFilePath) {
    const upload = await uploadOnCloudinary(thumbnailLocalFilePath);

    if (!upload) {
      throw new ApiError(500, "Error uploading thumbnail");
    }

    thumbnailObject = {
      url: upload?.url,
      public_id: upload?.public_id,
    };
  }

  video.thumbnail = thumbnailObject;
  video.title = title;
  video.description = description;

  const newVideoDetails = await video.save({ validateBeforeSave: false });
  await deleteFromCloudinary(oldThumbnail?.public_id);

  return res
    .status(200)
    .json(
      new ApiResponse(200, newVideoDetails, "Details updated successfully")
    );
});

const deleteVideo = asyncHandler(async (req, res) => {
  const user = req.user;

  if (!user) {
    throw new ApiError(401, "Unauthorized Request");
  }

  const { videoId } = req.params;

  if (!videoId) {
    throw new ApiError(400, "Video ID missing");
  }

  const video = await Video.findById(videoId);

  if (!video) {
    throw new ApiError(400, "Requested video not found");
  }

  if (video.owner.toString() !== user._id.toString()) {
    throw new ApiError(
      403,
      "User doesn't have permission to perform this action"
    );
  }

  const deletedVideo = await Video.deleteOne({ _id: video._id });

  if (!deletedVideo) {
    throw new ApiError(400, "Failed to delete video from the database");
  }

  return res.status(200).json({ message: "Video deleted successfully" });
});

const togglePublishStatus = asyncHandler(async (req, res) => {
  const { videoId } = req.params;
  const { isPublished } = req.body;

  if (!videoId) {
    throw new ApiError(400, "Video ID missing");
  }

  if (isPublished === undefined) {
    throw new ApiError(400, "Request missing");
  }

  const user = req.user;

  if (!user) {
    throw new ApiError(401, "Unauthorised request");
  }

  const video = await Video.findById(videoId);

  if (!video) {
    throw new ApiError(400, "Video not found");
  }

  if (video.owner.toString() !== user._id.toString()) {
    throw new ApiError(
      404,
      "User is not allowed to perform this specific action"
    );
  }

  video.isPublished = isPublished;

  const updatedVideo = await video.save({ validateBeforeSave: false });

  if (!updatedVideo) {
    throw new ApiError(500, "Failed to update the publish status");
  }

  return res
    .status(200)
    .json(
      new ApiResponse(200, updateVideo, "Publish status updated successfully")
    );
});

export {
  getVideos,
  publishAVideo,
  getVideoById,
  updateVideo,
  deleteVideo,
  togglePublishStatus,
};
