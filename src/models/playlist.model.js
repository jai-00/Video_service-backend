import mongoose, { Schema } from "mongoose";
import mongooseAggregatePaginate from "mongoose-aggregate-paginate-v2";

const playlistsSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
    },

    description: {
      type: String,
      required: true,
    },

    videos: [
      {
        type: Schema.Types.ObjectId,
        ref: "Video",
        required: true,
      },
    ],
    owner: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    visibility: {
      type: "public" | "private" | "unlisted",
      default: "public",
    },
  },
  {
    timestamps: true,
  }
);

export const Playlist = mongoose.model("Playlist", playlistsSchema);
