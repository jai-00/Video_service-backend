import mongoose, { Schema } from "mongoose";
import mongooseAggregatePaginate from "mongoose-aggregate-paginate-v2";

const videoSchema = new Schema(
  {
    videoFile: {
      type: {
        url: String,
        public_id: String,
      },
      required: true,
    },
    thumbnail: {
      type: {
        url: String,
        public_id: String,
      },
      required: true,
    },
    title: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      required: true,
    },
    duration: {
      type: Number,
      required: true,
    },
    views: {
      type: Number,
      required: true,
      default: 0,
    },
    isPublished: {
      type: Boolean,
      default: true,
      required: true,
    },
    owner: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    timestamps: true,
  }
);

videoSchema.index({ title: "text" });
videoSchema.index({ owner: 1 });
videoSchema.index({ createdAt: -1 });
videoSchema.plugin(mongooseAggregatePaginate);

export const Video = mongoose.model("Video", videoSchema);
