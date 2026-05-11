import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { Playlist } from "../models/playlist.model.js";
import { Video } from "../models/video.model.js";
import mongoose from "mongoose";
import { json } from "express";

//? - create a new playlist
const createPlaylist = asyncHandler(async (req, res) => {
  const user = req.user;
  const { name, description = "", visibility = "public" } = req.body;

  if (!user) {
    throw new ApiError(401, "Unauthorized request");
  }

  if (!name || name.trim() === "") {
    throw new ApiError(400, "Playlist name missing");
  }

  const newPlaylist = await Playlist.create({
    name: name.trim(),
    description: description?.trim() || "",
    videos: [],
    owner: user._id,
    visibility,
  });

  const playlistData = {
    _id: newPlaylist._id,
    name: newPlaylist.name,
    description: newPlaylist.description,
  };

  return res
    .status(201)
    .json(new ApiResponse(201, playlistData, "Playlist created successfully"));
});

//? - get all playlists of a user
const getUserPlaylists = asyncHandler(async (req, res) => {
  const { page = 1, limit = 10 } = req.query;
  const { userId } = req.params;

  const user = req.user;

  if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
    throw new ApiError(400, "Invalid user Id");
  }

  const isOwner = user && userId.toString() === user._id.toString();

  const parsedPage = Number(page);
  const parsedLimit = Number(limit);

  const pipeline = Playlist.aggregate([
    {
      $match: {
        owner: new mongoose.Types.ObjectId(userId),
        ...(isOwner ? {} : { visibility: "public" }),
      },
    },
    {
      $sort: {
        createdAt: -1,
      },
    },
    {
      $lookup: {
        from: "videos",
        let: {
          firstVideoId: {
            $arrayElemAt: ["$videos", 0],
          },
        },
        pipeline: [
          {
            $match: {
              $expr: {
                $eq: ["$_id", "$$firstVideoId"],
              },
            },
          },
          {
            $project: {
              thumbnail: 1,
            },
          },
        ],
        as: "thumbnailVideo",
      },
    },
    {
      $addFields: {
        videosCount: {
          $size: "$videos",
        },
      },
    },
    {
      $project: {
        name: 1,
        description: 1,
        thumbnail: {
          $arrayElemAt: ["$thumbnailVideo.thumbnail", 0],
        },
        videosCount: 1,
        createdAt: 1,
      },
    },
  ]);

  const options = {
    page: Number.isNaN(parsedPage) ? 1 : Math.max(parsedPage, 1),
    limit: Number.isNaN(parsedLimit)
      ? 10
      : Math.min(Math.max(parsedLimit, 1), 20),
  };

  const userPlaylists = await Playlist.aggregatePaginate(pipeline, options);

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        playlists: userPlaylists.docs,

        pagination: {
          totalDocuments: userPlaylists.totalDocs,
          totalPages: userPlaylists.totalPages,

          currentPage: userPlaylists.page,
          limit: userPlaylists.limit,

          hasPrevPage: userPlaylists.hasPrevPage,
          prevPage: userPlaylists.prevPage,
          hasNextPage: userPlaylists.hasNextPage,
          nextPage: userPlaylists.nextPage,
        },
      },
      "User playlists fetched successfully"
    )
  );
});

//? - get playlist using playlist id
const getPlaylistById = asyncHandler(async (req, res) => {
  const { playlistId } = req.params;
  const { limit = 100, page = 1 } = req.query;

  if (!playlistId || !mongoose.Types.ObjectId.isValid(playlistId)) {
    throw new ApiError(400, "Invalid playlist Id");
  }

  const parsedLimit = Number(limit);
  const parsedPage = Number(page);

  const calculatedLimit = Number.isNaN(parsedLimit)
    ? 10
    : Math.min(Math.max(parsedLimit, 1), 200);

  const calculatedPage = Number.isNaN(parsedPage) ? 1 : Math.max(parsedPage, 1);

  const playlistInfo = await Playlist.aggregate([
    {
      $match: {
        _id: new mongoose.Types.ObjectId(playlistId),
      },
    },
    {
      $addFields: {
        videosCount: {
          $size: {
            $ifNull: ["$videos", []],
          },
        },
      },
    },
    {
      $lookup: {
        from: "videos",
        let: {
          playlistVideos: "$videos",
        },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  {
                    $eq: ["$isPublished", true],
                  },
                  {
                    $in: ["$_id", "$$playlistVideos"],
                  },
                ],
              },
            },
          },
          {
            $addFields: {
              order: {
                $indexOfArray: ["$$playlistVideos", "$_id"],
              },
            },
          },
          {
            $sort: {
              order: 1,
            },
          },
          {
            $skip: (calculatedPage - 1) * calculatedLimit,
          },
          {
            $limit: calculatedLimit,
          },
          {
            $project: {
              thumbnail: 1,
              title: 1,
              duration: 1,
              views: 1,
            },
          },
        ],
        as: "videos",
      },
    },
  ]);

  if (!playlistInfo.length) {
    throw new ApiError(404, "Playlist not found");
  }
  const playlist = playlistInfo[0];

  const totalDocuments = playlist.videosCount;

  const totalPages = Math.ceil(totalDocuments / calculatedLimit);

  return res.status(200).json(
    new ApiResponse(200, {
      playlist,
      pagination: {
        totalDocuments,
        totalPages,
        currentPage: calculatedPage,
        limit: calculatedLimit,

        hasPrevPage: calculatedPage > 1,

        hasNextPage: calculatedPage < totalPages,

        prevPage: calculatedPage > 1 ? calculatedPage - 1 : null,

        nextPage: calculatedPage < totalPages ? calculatedPage + 1 : null,
      },
    })
  );
});

//? - add video to the playlist
const addVideoToPlaylist = asyncHandler(async (req, res) => {
  const { playlistId, videoId } = req.params;

  const user = req.user;

  if (!user) {
    throw new ApiError(401, "Unauthorized access");
  }

  if (!videoId || !mongoose.Types.ObjectId.isValid(videoId)) {
    throw new ApiError(400, "Invalid Video Id");
  }

  if (!playlistId || !mongoose.Types.ObjectId.isValid(playlistId)) {
    throw new ApiError(400, "Invalid Playlist Id");
  }

  const video = await Video.findById(videoId).lean();

  if (!video) {
    throw new ApiError(404, "Video not found");
  }

  const playlist = await Playlist.findById(playlistId).lean();

  if (!playlist) {
    throw new ApiError(404, "Playlist not found");
  }

  if (user._id.toString() !== playlist.owner.toString()) {
    throw new ApiError(403, "User cannot perform the action");
  }

  const updatedPlaylist = await Playlist.findByIdAndUpdate(
    playlistId,
    {
      $addToSet: {
        videos: new mongoose.Types.ObjectId(videoId),
      },
    },
    {
      new: true,
    }
  ).select("-visibility");

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        updatedPlaylist,
        "Video successfully added to playlist"
      )
    );
});

//? - remove video from playlist
const removeVideoFromPlaylist = asyncHandler(async (req, res) => {
  const { playlistId, videoId } = req.params;

  const user = req.user;

  if (!user) {
    throw new ApiError(401, "Unauthorized access");
  }

  if (!playlistId || !mongoose.Types.ObjectId.isValid(playlistId)) {
    throw new ApiError(400, "Invalid playlist Id");
  }

  if (!videoId || !mongoose.Types.ObjectId.isValid(videoId)) {
    throw new ApiError(400, "Invalid video Id");
  }

  const playlist = await Playlist.findById(playlistId);

  if (!playlist) {
    throw new ApiError(404, "Playlist not found");
  }

  if (playlist.owner.toString() !== user._id.toString()) {
    throw new ApiError(403, "User cannot perform this action");
  }

  const videoExists = playlist.videos.some(
    (vidId) => vidId.toString() === videoId
  );

  if (!videoExists) {
    throw new ApiError(404, "Video not found");
  }

  const newUpdatedPlaylist = await Playlist.findByIdAndUpdate(
    playlist._id,
    {
      $pull: {
        videos: new mongoose.Types.ObjectId(videoId),
      },
    },
    { new: true }
  ).select("-visibility");

  return res
    .status(200)
    .json(
      new ApiResponse(200, newUpdatedPlaylist, "Playlist updated successfully")
    );
});

//? - delete the complete playlist
const deletePlaylist = asyncHandler(async (req, res) => {
  const { playlistId } = req.params;

  const user = req.user;

  if (!user) {
    throw new ApiError(401, "Unauthorized access");
  }

  if (!playlistId || !mongoose.Types.ObjectId.isValid(playlistId)) {
    throw new ApiError(400, "Invalid Playlist Id");
  }

  const playlist = await Playlist.findById(playlistId);

  if (!playlist) {
    throw new ApiError(404, "Playlist not found");
  }

  if (playlist.owner.toString() !== user._id.toString()) {
    throw new ApiError(403, "User cannot perform this action");
  }

  await Playlist.findByIdAndDelete(playlistId);

  return res
    .status(200)
    .json(new ApiResponse(200, {}, "Playlist deleted successfully"));
});

//? - update name and description of playlist
const updatePlaylist = asyncHandler(async (req, res) => {
  const { playlistId } = req.params;
  const { name, description } = req.body;

  const user = req.user;

  if (!user) {
    throw new ApiError(401, "Unauthorized access");
  }

  if (!playlistId || !mongoose.Types.ObjectId.isValid(playlistId)) {
    throw new ApiError(400, "Invalid playlist Id");
  }

  if (!name?.trim()) {
    throw new ApiError(400, "Name field cannot be empty");
  }

  const updatedName = name.trim();
  const updatedDescription = description?.trim() || "";

  const playlist = await Playlist.findById(playlistId);

  if (!playlist) {
    throw new ApiError(404, "Playlist not found");
  }

  if (playlist.owner.toString() !== user._id.toString()) {
    throw new ApiError(403, "User cannot perform this action");
  }

  const updatedPlaylist = await Playlist.findByIdAndUpdate(
    playlistId,
    {
      name: updatedName,
      description: updatedDescription,
    },
    { new: true }
  ).select("-visibility");

  return res
    .status(200)
    .json(
      new ApiResponse(200, updatedPlaylist, "Playlist updated successfully")
    );
});

export {
  createPlaylist,
  getUserPlaylists,
  getPlaylistById,
  addVideoToPlaylist,
  removeVideoFromPlaylist,
  deletePlaylist,
  updatePlaylist,
};
