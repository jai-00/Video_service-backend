import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import {
  deleteFromCloudinary,
  uploadOnCloudinary,
} from "../utils/cloudinary.js";
import { User } from "../models/user.model.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import removeTempFiles from "../utils/RemoveTempFiles.js";
import jwt from "jsonwebtoken";
// import { upload } from "../middlewares/multer.middleware.js";

const generateAccessAndRefreshTokens = async (userId) => {
  try {
    const user = await User.findById(userId);

    const accessToken = await user.generateAccessToken();

    const refreshToken = await user.generateRefreshToken();

    user.refreshToken = refreshToken;
    await user.save({ validateBeforeSave: false });

    return { accessToken, refreshToken };
  } catch (err) {
    throw new ApiError(
      500,
      "Something went wrong while generating refresh and access token"
    );
  }
};

const registerUser = asyncHandler(async (req, res, next) => {
  //get data from request
  //check if all mandatory data is present or not
  //then check if user already exist
  //upload images to cloudinary and get link
  //add the data to the database
  //send data back but remove the password and the refresh token field
  //   const { email } = req.body;
  //   console.log(email);
  //   console.log(req.body.email);

  //- getting the data submitted by the frontend **
  const { email, username, fullName, password } = req.body;
  const avatarLocalPath = req.files?.avatar?.[0].path;
  const coverImageLocalPath = req.files?.coverImage?.[0].path;

  function removeBothTempFiles() {
    if (avatarLocalPath) {
      removeTempFiles(avatarLocalPath);
    }

    if (coverImageLocalPath) {
      removeTempFiles(coverImageLocalPath);
    }
  }

  //- validating user responses **
  if (
    [fullName, email, username, password].some(
      (field) => !field || field.trim() === ""
    )
  ) {
    removeBothTempFiles();
    throw new ApiError(400, "fields must not be empty");
  }

  // if (fullName === "") {
  //   removeBothTempFiles();
  //   throw new ApiError(400, "fullname is required");
  // }

  // if (!email.includes("@")) {
  //   removeBothTempFiles();
  //   throw new ApiError(400, "email must be of the right format");
  // }

  //- finding if user already exist

  const existingUsername = await User.findOne({ username });

  if (existingUsername) {
    removeBothTempFiles();
    throw new ApiError(409, "Username already exist");
  }

  const existingEmail = await User.findOne({ email });

  if (existingEmail) {
    removeBothTempFiles();
    throw new ApiError(409, "Email already exist");
  }

  // const existingUser = User.findOne({
  // $or: [{ username }, { email }],
  // });

  //   if (existingUser) {
  //     throw new ApiError(409, "User already exist");
  //   }

  if (!avatarLocalPath) {
    throw new ApiError(400, "avatar in necessary");
  }

  const avatar = await uploadOnCloudinary(avatarLocalPath);
  let coverImage = null;
  if (coverImageLocalPath) {
    const uploaded = await uploadOnCloudinary(coverImageLocalPath);

    if (uploaded) {
      coverImage = {
        url: uploaded.url,
        public_id: uploaded.public_id,
      };
    }
  }

  if (!avatar) {
    throw new ApiError(400, "Avatar file is required");
  }

  const user = await User.create({
    fullName,
    avatar: {
      url: avatar.url,
      public_id: avatar.public_id,
    },
    coverImage: coverImage || "",
    email: email.toLowerCase(),
    username: username.toLowerCase(),
    password,
  });

  const createdUser = await User.findById(user._id).select(
    "-password -refreshToken"
  );

  if (!createdUser) {
    throw new ApiError(500, "Something went wrong while registering the user");
  }
  //   console.log(avatar);

  return res
    .status(201)
    .json(new ApiResponse(200, createdUser, "User registered successfully"));
});

const loginUser = asyncHandler(async (req, res) => {
  const { username, email, password } = req.body;

  if (!username && !email) {
    throw new ApiError(400, "username or email is required");
  }

  if (!password) {
    throw new ApiError(400, "Password field is empty");
  }

  const user = await User.findOne({
    $or: [{ username }, { email }],
  });

  if (!user) {
    throw new ApiError(404, "User does not exist");
  }
  // console.log(user);

  const isPasswordValid = await user.isPasswordCorrect(password);

  if (!isPasswordValid) {
    throw new ApiError(401, "Invalid user credentials");
  }

  const { accessToken, refreshToken } = await generateAccessAndRefreshTokens(
    user._id
  );

  const updatedUser = await User.findById(user._id).select(
    "-password -refreshToken"
  );

  const options = {
    httpOnly: true,
    secure: true,
  };

  return res
    .status(200)
    .cookie("accessToken", accessToken, options)
    .cookie("refreshToken", refreshToken, options)
    .json(
      new ApiResponse(
        200,
        { user: updatedUser, accessToken, refreshToken },
        "User logged in successfully"
      )
    );
});

const logoutUser = asyncHandler(async (req, res) => {
  await User.findByIdAndUpdate(
    req.user._id,
    {
      $set: {
        refreshToken: undefined,
      },
    },
    {
      new: true,
    }
  );

  const options = {
    httpOnly: true,
    secure: true,
  };

  return res
    .status(200)
    .clearCookie("accessToken", options)
    .clearCookie("refreshToken", options)
    .json(new ApiResponse(200, {}, "User logged out successfully"));
});

const refreshAccessToken = asyncHandler(async (req, res) => {
  // const refreshToken = req.cookies?.refreshToken || req.header.refreshToken;

  // if (!refreshToken) {
  //   return new ApiError(400, "Refresh Token not found");
  // }

  try {
    // const incomingRefreshToken = jwt.verify(
    //   refreshToken,
    //   process.env.REFRESH_TOKEN_SECRET
    // );
    // if (!incomingRefreshToken) {
    //   throw new ApiError(401, "Unauthorized access");
    // }
    // const user = await User.findById(incomingRefreshToken?._id);

    // if (!user) {
    //   throw new ApiError(401, "User doesn't exist");
    // }

    // if (user.refreshToken !== income) {
    // }

    const incomingRefreshToken =
      req.cookies?.refreshToken || req.header.refreshToken;

    if (!incomingRefreshToken) {
      return new ApiError(401, "Unauthorized access");
    }

    const decodedToken = jwt.verify(
      incomingRefreshToken,
      process.env.REFRESH_TOKEN_SECRET
    );

    const user = await User.findById(decodedToken?.id);

    if (!user) {
      throw new ApiError(401, "Invalid refresh token");
    }

    if (user?.refreshToken !== incomingRefreshToken) {
      throw new ApiError(401, "Refresh token is expired or used");
    }

    const options = {
      httpOnly: true,
      secure: true,
    };
    const { accessToken, refreshToken } = await generateAccessAndRefreshTokens(
      user._id
    );

    return res
      .status(200)
      .cookie("accessToken", accessToken)
      .cookie("refreshToken", refreshToken)
      .json(
        new ApiResponse(
          200,
          { accessToken, refreshToken },
          "Access token refreshed"
        )
      );
  } catch (error) {
    return new ApiError(500, "Something went wrong while refreshing the token");
  }
});

const changeCurrentPassword = asyncHandler(async (req, res) => {
  const { oldPassword, newPassword } = req.body;

  if (!oldPassword || !newPassword) {
    throw new ApiError(401, "Both old and new passwords required");
  }

  const userData = req.user;

  if (!userData) {
    throw new ApiError(401, "User unauthorized");
  }

  const user = await User.findById(userData?._id);

  if (!user) {
    throw new ApiError(401, "User not found in database");
  }

  const isPasswordCorrect = await user.isPasswordCorrect(oldPassword);

  if (!isPasswordCorrect) {
    throw new ApiError(400, "Invalid password");
  }

  user.password = newPassword;
  await user.save({ validateBeforeSave: false });

  return res
    .status(200)
    .json(new ApiResponse(200, {}, "Password changed successfully"));
});

const getCurrentUser = asyncHandler(async (req, res) => {
  const user = req.user;

  return res
    .status(200)
    .json(new ApiResponse(200, user, "Current user fetched successfully"));
});

const updateAvatar = asyncHandler(async (req, res) => {
  try {
    const avatarLocalPath = req.file?.path;

    if (!avatarLocalPath) {
      throw new ApiError(401, "Cannot find new avatar image");
    }

    const avatar = await uploadOnCloudinary(avatarLocalPath);

    if (!avatar) {
      throw new ApiError(401, "Error uploading avatar image to cloud");
    }

    const avatarObject = {
      url: avatar.url,
      public_id: avatar.public_id,
    };

    const user = await User.findById(req.user?._id);

    if (!user) {
      throw new ApiError(401, "Unauthorized Request");
    }

    const oldPublicId = user.avatar?.public_id;

    user.avatar = avatarObject;
    await user.save({ validateBeforeSave: false });
    if (oldPublicId) {
      await deleteFromCloudinary(oldPublicId);
    }
    // console.log("Error not here");

    return res
      .status(200)
      .json(new ApiResponse(200, user, "Avatar updated successfully"));
  } catch (error) {
    throw new ApiError(
      error.statusCode || 500,
      error.message || "Something went wrong while updating your avatar"
    );
  }
});

const updateCoverImage = asyncHandler(async (req, res) => {
  const coverImageLocalPath = req.file?.path;

  if (!coverImageLocalPath) {
    throw new ApiError(400, "Cover image file missing");
  }

  const coverImage = await uploadOnCloudinary(coverImageLocalPath);

  if (!coverImage) {
    throw new ApiError(500, "Cloudinary upload failed");
  }

  // console.log("error not here");

  const coverImageObject = {
    url: coverImage.url,
    public_id: coverImage.public_id,
  };

  const user = await User.findById(req.user?._id);

  if (!user) {
    throw new ApiError(401, "Unauthorized Request");
  }

  const oldPublicId = user.coverImage?.public_id;

  user.coverImage = coverImageObject;
  await user.save({ validateBeforeSave: false });
  if (oldPublicId) {
    await deleteFromCloudinary(oldPublicId);
  }
  // console.log("Error not here");

  return res
    .status(200)
    .json(new ApiResponse(200, user, "Cover image updated successfully"));
});

export {
  registerUser,
  loginUser,
  logoutUser,
  refreshAccessToken,
  changeCurrentPassword,
  getCurrentUser,
  updateAvatar,
  updateCoverImage,
};
