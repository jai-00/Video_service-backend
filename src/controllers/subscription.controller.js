import { asyncHandler } from "../utils/asyncHandler";
import { Subscription } from "../models/subscription.model";
import { ApiError } from "../utils/ApiError";
import mongoose from "mongoose";
import { User } from "../models/user.model";
import { ApiResponse } from "../utils/ApiResponse";

const toggleSubscription = asyncHandler(async (req, res) => {
  const { channelId } = req.params;

  const user = req.user;

  if (!user) {
    throw new ApiError(401, "Unauthorized access");
  }

  if (!channelId || !mongoose.Types.ObjectId.isValid(channelId)) {
    throw new ApiError(400, "Channel Id invalid");
  }

  const channelExists = await User.exists({
    _id: channelId,
  });

  if (!channelExists) {
    throw new ApiError(404, "Channel does not exist");
  }

  if (user._id.toString() === channelId) {
    throw new ApiError(400, "You cannot subscribe to yourself");
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  let subscribed;

  try {
    const hasSubscribed = await Subscription.exists({
      subscriber: user._id,
      channel: channelId,
    }).session(session);

    if (hasSubscribed) {
      await Promise.all([
        Subscription.deleteOne(
          {
            subscriber: user._id,
            channel: channelId,
          },
          { session }
        ),
        User.updateOne(
          { _id: channelId },
          {
            $inc: { subscriberCount: -1 },
          },
          { session }
        ),
        User.updateOne(
          { _id: user._id },
          {
            $inc: { subscribedToCount: -1 },
          },
          { session }
        ),
      ]);
    } else {
      await Promise.all([
        (Subscription.create(
          [
            {
              subscriber: user._id,
              channel: channelId,
            },
          ],
          { session }
        ),
        User.updateOne(
          { _id: channelId },
          {
            $inc: { subscriberCount: 1 },
          },
          { session }
        ),
        User.updateOne(
          { _id: user._id },
          {
            $inc: { subscribedToCount: 1 },
          },
          { session }
        )),
      ]);
    }

    subscribed = !hasSubscribed;
    await session.commitTransaction();
  } catch (err) {
    await session.abortTransaction();
    throw new ApiError(500, "Error while updating the subscription status");
  } finally {
    await session.endSession();
  }

  return res
    .status(200)
    .json(
      new ApiResponse(200, { subscribed }, "Subscription updated successfully")
    );
});

//controller to return subscriber list of a channel
const getChannelSubscribers = asyncHandler(async (req, res) => {
  const { page = 1, limit = 100 } = req.query;
  const { channelId } = req.params;

  if (!channelId || !mongoose.Types.ObjectId.isValid(channelId)) {
    throw new ApiError(404, "Invalid channel Id");
  }

  const parsedPage = Number(page);
  const parsedLimit = Number(limit);

  const options = {
    page: Number.isNaN(parsedPage) ? 1 : Math.max(parsedPage, 1),
    limit: Number.isNaN(parsedLimit)
      ? 100
      : Math.min(Math.max(parsedLimit, 1), 200),
  };

  const pipeline = Subscription.aggregate([
    {
      $match: {
        channel: new mongoose.Types.ObjectId(channelId),
      },
    },

    {
      $lookup: {
        from: "users",
        localField: "subscriber",
        foreignField: "_id",
        as: "subscriberInfo",
        pipeline: [
          {
            $project: {
              username: 1,
              avatar: 1,
              subscriberCount: 1,
            },
          },
        ],
      },
    },
    {
      $unwind: "$subscriberInfo",
    },
    {
      $project: {
        _id: "$subscriber",
        username: "$subscriberInfo.username",
        avatar: "$subscriberInfo.avatar",
        subscriberCount: "$subscriberInfo.subscriberCount",
        createdAt: 1,
      },
    },
    {
      $sort: {
        subscriberCount: -1,
        createdAt: -1,
      },
    },
  ]);

  const channelSubscribers = await Subscription.aggregatePaginate(
    pipeline,
    options
  );

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        subscribers: channelSubscribers.docs,
        count: channelSubscribers.totalDocs,
        pagination: {
          totalPages: channelSubscribers.totalPages,
          totalDocuments: channelSubscribers.totalDocs,
          currentPage: channelSubscribers.page,
          limit: channelSubscribers.limit,

          hasNextPage: channelSubscribers.hasNextPage,
          hasPrevPage: channelSubscribers.hasPrevPage,
          nextPage: channelSubscribers.nextPage,
          prevPage: channelSubscribers.prevPage,
        },
      },
      "Channel subscribers fetched successfully"
    )
  );
});

//controller to return channel list to which user has subscribed
const getSubscribedChannels = asyncHandler(async (req, res) => {
  const { limit = 50, page = 1 } = req.query;
  const { subscriberId } = req.params;

  const user = req.user;

  if (!user) {
    throw new ApiError(401, "Unauthorized access");
  }

  if (!subscriberId || !mongoose.Types.ObjectId.isValid(subscriberId)) {
    throw new ApiError(400, "Subscriber Id invalid");
  }

  const parsedLimit = Number(limit);
  const parsedPage = Number(page);

  const doesSubscriberExist = await User.exists({
    _id: subscriberId,
  });

  if (!doesSubscriberExist) {
    throw new ApiError(404, "Requested Subscriber not found");
  }

  const options = {
    limit: Number.isNaN(parsedLimit)
      ? 10
      : Math.min(Math.max(parsedLimit, 1), 50),
    page: Number.isNaN(parsedPage) ? 1 : Math.max(parsedPage, 1),
  };

  const pipeline = Subscription.aggregate([
    {
      $match: {
        subscriber: new mongoose.Types.ObjectId(subscriberId),
      },
    },
    {
      $sort: {
        createdAt: -1,
      },
    },
    {
      $lookup: {
        from: "users",
        localField: "channel",
        foreignField: "_id",
        as: "channelInfo",
        pipeline: [
          {
            $project: {
              username: 1,
              avatar: 1,
              subscriberCount: 1,
            },
          },
        ],
      },
    },
    {
      $unwind: "$channelInfo",
    },
    {
      $project: {
        _id: "$channel",
        username: "$channelInfo.username",
        avatar: "$channelInfo.avatar",
        subscriberCount: "$channelInfo.subscriberCount",
      },
    },
  ]);

  const subscribedChannels = await Subscription.aggregatePaginate(
    pipeline,
    options
  );

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        channels: subscribedChannels.docs,
        count: subscribedChannels.totalDocs,
        pagination: {
          totalDocuments: subscribedChannels.totalDocs,
          totalPage: subscribedChannels.totalPages,
          currentPage: subscribedChannels.page,
          limit: subscribedChannels.limit,

          hasNextPage: subscribedChannels.hasNextPage,
          hasPrevPage: subscribedChannels.hasPrevPage,
          nextPage: subscribedChannels.nextPage,
          prevPage: subscribedChannels.prevPage,
        },
      },
      "Subscribed channels fetched successfully"
    )
  );
});

export { toggleSubscription, getChannelSubscribers, getSubscribedChannels };
