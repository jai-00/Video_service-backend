import { ApiResponse } from "../utils/ApiResponse.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import mongoose from "mongoose";

const healthcheck = asyncHandler(async (req, res) => {
  const dbState = mongoose.connection.readyState;

  const dbStatus = dbState === 1 ? "connected" : "disconnected";

  if (dbState !== 1) {
    return res.status(500).json(
      new ApiResponse(
        500,
        {
          database: dbStatus,
        },
        "Database not connected"
      )
    );
  }

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        database: dbStatus,
        uptime: process.uptime(),
        timestamp: new Date(),
      },
      "Server is healthy"
    )
  );
});

export { healthcheck };
