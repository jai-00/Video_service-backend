import mongoose, { Schema, SchemaType } from "mongoose";

const likeSchema = new Schema(
  {
    likedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    video: {
      type: Schema.Types.ObjectId,
      ref: "Video",
    },
    comment: {
      type: Schema.Types.ObjectId,
      ref: "Comment",
    },
    tweet: {
      type: Schema.Types.ObjectId,
      ref: "Tweet",
    },
  },
  {
    timestamps: true,
  }
);

likeSchema.index({ likedBy: 1, createdAt: -1 });

likeSchema.index(
  { likedBy: 1, video: 1 },
  {
    unique: true,
    partialFilterExpression: { video: { $exists: true } },
  }
);

likeSchema.index(
  {
    likedBy: 1,
    comment: 1,
  },
  {
    unique: true,
    partialFilterExpression: { comment: { $exists: true } },
  }
);

likeSchema.index(
  {
    likedBy: 1,
    tweet: 1,
  },
  {
    unique: true,
    partialFilterExpression: { tweet: { $exists: true } },
  }
);

export const Like = mongoose.model("Like", likeSchema);
