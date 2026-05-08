import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { Tweet } from "../models/tweet.model.js";
import mongoose, { isValidObjectId } from "mongoose";
import { User } from "../models/user.model.js";
import { Like } from "../models/like.model.js";

const createTweet = asyncHandler(async (req, res) => {
  const { content } = req.body;

  const user = req.user;

  if (!user) {
    throw new ApiError(401, "Unauthorized access");
  }

  if (!content || content.trim() === "") {
    throw new ApiError(400, "Content missing");
  }

  const newTweet = await Tweet.create({
    owner: user._id,
    content: content.trim(),
    // likesCount: 0,
  });

  return res
    .status(201)
    .json(new ApiResponse(201, newTweet, "Tweet created successfully"));
});

const getUserTweets = asyncHandler(async (req, res) => {
  let { limit = 10, page = 1 } = req.query;
  const user = req.user;

  limit = Math.min(Number(limit) || 10, 50);
  page = Number(page) || 1;

  if (!user) {
    throw new ApiError(401, "Unauthorized access");
  }

  if (page < 1 || limit < 1) {
    throw new ApiError(400, "Invalid pagination params");
  }

  const options = {
    limit,
    page,
  };

  const pipeline = Tweet.aggregate([
    {
      $match: {
        owner: user._id,
        isDeleted: false,
      },
    },
    {
      $sort: {
        createdAt: -1,
      },
    },
    {
      $lookup: {
        from: "likes",
        let: { tweetId: "$_id" },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ["$$tweetId", "$tweet"] },
                  { $eq: ["$likedBy", user._id] },
                ],
              },
            },
          },
        ],
        as: "likedInfo",
      },
    },
    {
      $addFields: {
        isLiked: { $gt: [{ $size: "$likedInfo" }, 0] },
      },
    },
    {
      $project: {
        isLiked: 1,
        content: 1,
        likesCount: 1,
        createdAt: 1,
      },
    },
  ]);

  // const [tweets, total] = await Promise.all([
  //   Tweet.aggregatePaginate(pipeline, options),
  //   Tweet.countDocuments({ owner: user._id, isDeleted: false }),
  // ]);

  const tweets = await Tweet.aggregatePaginate(pipeline, options);

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        tweets: tweets.docs,
        total: tweets.totalDocs,
        totalPages: tweets.totalPages,
        currentPage: tweets.page,
        hasNextPage: tweets.hasNextPage,
      },
      "Tweets fetched successfully"
    )
  );
});

const validateTweetOwnership = async (userId, tweetId) => {
  const tweet = await Tweet.findById(tweetId).select("owner isDeleted");
  if (!tweet) {
    throw new ApiError(404, "Tweet not found");
  }

  if (tweet.isDeleted) {
    throw new ApiError(400, "Tweet is already deleted");
  }

  if (tweet.owner.toString() !== userId.toString()) {
    throw new ApiError(403, "User cannot edit/delete this tweet");
  }

  return tweet;
};

const updateTweet = asyncHandler(async (req, res) => {
  const { content } = req.body;
  const user = req.user;
  const { tweetId } = req.params;

  if (!user) {
    throw new ApiError(401, "Unauthorized access");
  }

  if (!content || content.trim() === "") {
    throw new ApiError(400, "Content missing");
  }

  if (!tweetId || !mongoose.Types.ObjectId.isValid(tweetId)) {
    throw new ApiError(400, "Invalid Tweet Id");
  }

  await validateTweetOwnership(user._id, tweetId);

  const newTweet = await Tweet.findByIdAndUpdate(
    tweetId,
    {
      content: content.trim(),
    },
    {
      new: true,
    }
  );

  return res
    .status(200)
    .json(new ApiResponse(200, newTweet, "Tweet Updated Successfully"));
});

const deleteTweet = asyncHandler(async (req, res) => {
  const { tweetId } = req.params;
  const user = req.user;

  if (!user) {
    throw new ApiError(401, "Unauthorized access");
  }

  if (!tweetId || !mongoose.Types.ObjectId.isValid(tweetId)) {
    throw new ApiError(400, "Invalid Tweet Id");
  }

  const tweet = await validateTweetOwnership(user._id, tweetId);

  await Tweet.findByIdAndUpdate(tweet._id, {
    content: "This tweet has been deleted",
    isDeleted: true,
  });

  return res
    .status(200)
    .json(new ApiResponse(200, {}, "Tweet deleted successfully"));
});

export { createTweet, getUserTweets, updateTweet, deleteTweet };
