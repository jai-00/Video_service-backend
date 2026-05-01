import { asyncHandler } from "../utils/asyncHandler.js";
import { Comment } from "../models/comment.model.js";
import mongoose from "mongoose";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";

const getVideoComments = asyncHandler(async (req, res) => {
  const { videoId } = req.params;

  const { page = 1, limit = 10 } = req.query;

  if (!videoId) {
    throw new ApiError(400, "Video Id missing");
  }

  const options = {
    page: Number(page),
    limit: Number(limit),
  };

  const pipeline = Comment.aggregate([
    {
      $match: {
        video: new mongoose.Types.ObjectId(videoId),
        isDeleted: false,
        parentComment: null,
      },
    },
    {
      $sort: { likesCount: -1, createdAt: -1 },
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
              fullName: 1,
              avatar: 1,
            },
          },
        ],
      },
    },
    {
      $addFields: {
        owner: { $first: "$owner" },
      },
    },
  ]);

  const comments = await Comment.aggregatePaginate(pipeline, options);

  return res
    .status(200)
    .json(new ApiResponse(200, comments, "Comments fetched successfully"));
});

const addComment = asyncHandler(async (req, res) => {
  let { content, parentCommentId } = req.body;
  const { videoId } = req.params;
  const user = req.user;

  if (!user) {
    throw new ApiError(401, "Unauthorized user action");
  }

  if (!mongoose.Types.ObjectId.isValid(videoId)) {
    throw new ApiError(400, "Invalid Video ID");
  }

  if (!content || content.trim() === "") {
    throw new ApiError(400, "Comment missing");
  }

  if (!parentCommentId) {
    parentCommentId = null;
  } else {
    if (!mongoose.Types.ObjectId.isValid(parentCommentId)) {
      throw new ApiError(400, "Invalid parent comment ID");
    }
    const parent = await Comment.findById(parentCommentId).select("video");
    if (!parent) {
      throw new ApiError(404, "Parent comment not found");
    }
    if (parent.video.toString() !== videoId.toString()) {
      throw new ApiError(400, "Parent comment does not belong to this video");
    }
  }

  const comment = await Comment.create({
    content: content.trim(),
    video: videoId,
    owner: user._id,
    parentComment: parentCommentId,
    repliesCount: 0,
    likesCount: 0,
    isDeleted: false,
    isEdited: false,
  });

  if (parentCommentId) {
    await Comment.findByIdAndUpdate(parentCommentId, {
      $inc: { repliesCount: 1 },
    });
  }

  return res
    .status(201)
    .json(new ApiResponse(201, comment, "Comment created successfully"));
});

const deleteComment = asyncHandler(async (req, res) => {
  const { videoId } = req.body;
  const { commentId } = req.params;
  const user = req.user;

  if (!videoId || !mongoose.Types.ObjectId.isValid(videoId)) {
    throw new ApiError(400, "Invalid video ID");
  }

  if (!user) {
    throw new ApiError(401, "Unauthorized action");
  }

  if (!commentId || !mongoose.Types.ObjectId.isValid(commentId)) {
    throw new ApiError(400, "Invalid comment ID");
  }

  const comment = await Comment.findById(commentId).select(
    "owner video parentComment isDeleted"
  );

  if (!comment) {
    throw new ApiError(404, "Comment not found");
  }
  if (comment.video.toString() !== videoId.toString()) {
    throw new ApiError(400, "Comment does not belong to this video");
  }

  if (comment.owner.toString() !== user._id.toString()) {
    throw new ApiError(403, "User not authorized to perform the action");
  }
  const session = await mongoose.startSession();
  await session.startTransaction();

  try {
    const hasReplies = await Comment.exists({
      parentComment: commentId,
      isDeleted: false,
    }).session(session);
    if (hasReplies) {
      if (!comment.isDeleted) {
        await Comment.findByIdAndUpdate(
          commentId,
          {
            content: "This comment has been deleted",
            isDeleted: true,
          },
          { session }
        );
      }
    } else {
      if (comment.parentComment) {
        const parentComment = await Comment.findByIdAndUpdate(
          comment.parentComment,
          {
            $inc: { repliesCount: -1 },
          },
          { new: true, session, select: "repliesCount isDeleted" }
        );

        if (!parentComment) {
          throw new ApiError(
            404,
            "Parent comment not found or unable to update"
          );
        }

        if (parentComment.repliesCount === 0 && parentComment.isDeleted) {
          await Comment.deleteOne({ _id: parentComment._id }, { session });
        }
      }
      await Comment.findByIdAndDelete(commentId, { session });
    }
    await session.commitTransaction();
  } catch (error) {
    await session.abortTransaction();
    throw new ApiError(500, "Failed to delete comment");
  } finally {
    session.endSession();
  }
  return res
    .status(200)
    .json(new ApiResponse(200, {}, "Comment deleted successfully"));
});

const updateComment = asyncHandler(async (req, res) => {
  const { content } = req.body;
  const { commentId } = req.params;
  const user = req.user;

  if (!commentId || !mongoose.Types.ObjectId.isValid(commentId)) {
    throw new ApiError(400, "Invalid comment ID");
  }

  if (!user) {
    throw new ApiError(401, "Unauthorized action");
  }

  if (!content || content.trim() === "") {
    throw new ApiError(400, "Content is missing");
  }

  const comment = await Comment.findById(commentId);

  if (!comment) {
    throw new ApiError(404, "Comment not found");
  }

  if (comment.content === content.trim()) {
    return res
      .status(200)
      .json(new ApiResponse(200, comment, "No changes made"));
  }

  if (comment.isDeleted) {
    throw new ApiError(400, "Cannot edit a deleted comment");
  }

  if (comment.owner.toString() !== user._id.toString()) {
    throw new ApiError(403, "User unauthorized to perform this action");
  }

  const updatedComment = await Comment.findByIdAndUpdate(
    commentId,
    {
      content: content.trim(),
      isEdited: true,
    },
    {
      new: true,
    }
  );

  return res
    .status(200)
    .json(new ApiResponse(200, updatedComment, "Comment updated successfully"));
});

export { getVideoComments, addComment, deleteComment, updateComment };
