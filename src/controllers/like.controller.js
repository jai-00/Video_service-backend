import mongoose, { isValidObjectId } from "mongoose";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { Like } from "../models/like.model.js";
import { Comment } from "../models/comment.model.js";
import { Video } from "../models/video.model.js";
import { Tweet } from "../models/tweet.model.js";

const toggleLike = async (user, likeField, id) => {
  const existingLike = await Like.findOne({
    likedBy: user._id,
    [likeField]: id,
  });

  const session = await mongoose.startSession();
  await session.startTransaction();
  try {
    if (existingLike) {
      await Like.deleteOne({ _id: existingLike._id }, { session });
      if (likeField === "video") {
        await Video.findByIdAndUpdate(
          id,
          { $inc: { likesCount: -1 } },
          { session }
        );
      } else if (likeField === "comment") {
        await Comment.findByIdAndUpdate(
          id,
          { $inc: { likesCount: -1 } },
          { session }
        );
      } else if (likeField === "tweet") {
        await Tweet.findByIdAndUpdate(
          id,
          { $inc: { likesCount: -1 } },
          {
            session,
          }
        );
      } else {
        throw new ApiError(400, "Likes field not valid");
      }
    } else {
      await Like.create(
        {
          [likeField]: id,
          likedBy: user._id,
        },
        { session }
      );

      if (likeField === "video") {
        await Video.findByIdAndUpdate(
          id,
          { $inc: { likesCount: 1 } },
          { session }
        );
      } else if (likeField === "comment") {
        await Comment.findByIdAndUpdate(
          id,
          { $inc: { likesCount: 1 } },
          { session }
        );
      } else if (likeField === "tweet") {
        await Tweet.findByIdAndUpdate(
          id,
          { $inc: { likesCount: 1 } },
          {
            session,
          }
        );
      } else {
        throw new ApiError(400, "Likes field not valid");
      }
    }
    await session.commitTransaction();
  } catch (err) {
    await session.abortTransaction();
    throw new ApiError(500, "Error while updating like info");
  } finally {
    session.endSession();
  }
};

const toggleVideoLike = asyncHandler(async (req, res) => {
  const { videoId } = req.params;

  const user = req.user;

  if (!videoId || !isValidObjectId(videoId)) {
    throw new ApiError(400, "Video Id invalid");
  }

  if (!user) {
    throw new ApiError(401, "Unauthorized access");
  }

  try {
    await toggleLike(user, "video", videoId);
  } catch (err) {
    throw new ApiError(400, "Error while updating video like");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, {}, "Like updated successfully"));
});

const toggleCommentLike = asyncHandler(async (req, res) => {
  const { commentId } = req.params;

  const user = req.user;

  if (!commentId || !isValidObjectId(commentId)) {
    throw new ApiError(400, "Video Id invalid");
  }

  if (!user) {
    throw new ApiError(401, "Unauthorized access");
  }

  try {
    await toggleLike(user, "comment", commentId);
  } catch {
    throw new ApiError(400, "Error while updating comment like");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, {}, "Comment like updated successfully"));
});

const toggleTweetLike = asyncHandler(async (req, res) => {
  const { tweetId } = req.params;
  const user = req.user;

  if (!tweetId || !isValidObjectId(tweetId)) {
    throw new ApiError(400, "Video Id invalid");
  }

  if (!user) {
    throw new ApiError(401, "Unauthorized access");
  }
  try {
    await toggleLike(user, "tweet", tweetId);
  } catch (err) {
    throw new ApiError(400, "Error while updating tweet like");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, {}, "Tweet like updated successfully"));
});

const getLikedVideos = asyncHandler(async (req, res) => {
  const { page = 1, limit = 10 } = req.query;
  const user = req.user;

  if (!user) {
    throw new ApiError(401, "Unauthorized access");
  }

  const options = {
    limit: Number(limit),
    page: Number(page),
  };

  const pipeline = Like.aggregate([
    {
      $match: {
        video: { $ne: null },
        likedBy: new mongoose.Types.ObjectId(user._id),
      },
    },

    {
      $sort: { createdAt: -1 },
    },
    {
      $lookup: {
        from: "videos",
        localField: "video",
        foreignField: "_id",
        as: "video",
        pipeline: [
          {
            $match: {
              isPublished: true,
            },
          },
          {
            $lookup: {
              from: "users",
              localField: "owner",
              foreignField: "_id",
              as: "owner",
              pipeline: [
                {
                  $project: {
                    username: 1,
                  },
                },
              ],
            },
          },
          {
            $unwind: "$owner",
          },
          {
            $project: {
              _id: 1,
              thumbnail: 1,
              title: 1,
              views: 1,
              duration: 1,
              owner: 1,
            },
          },
        ],
      },
    },
    {
      $unwind: { path: "$video", preserveNullAndEmptyArrays: false },
    },
    {
      $replaceRoot: {
        newRoot: {
          $mergeObjects: [
            "$video",
            {
              likedAt: "$createdAt",
            },
          ],
        },
      },
    },
  ]);

  const likedVideos = await Like.aggregatePaginate(pipeline, options);

  if (!likedVideos.docs.length) {
    return res
      .status(200)
      .json(new ApiResponse(200, likedVideos, "No liked videos found"));
  }

  return res
    .status(200)
    .json(
      new ApiResponse(200, likedVideos, "Liked videos fetched successfully")
    );
});

export { toggleVideoLike, toggleCommentLike, toggleTweetLike, getLikedVideos };
