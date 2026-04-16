import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";
import { User } from "../models/user.model.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import removeTempFiles from "../utils/RemoveTempFiles.js";

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

  if (fullName === "") {
    removeBothTempFiles();
    throw new ApiError(400, "fullname is required");
  }

  if (!email.includes("@")) {
    removeBothTempFiles();
    throw new ApiError(400, "email must be of the right format");
  }

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
    coverImage = uploaded?.url || null;
  }

  if (!avatar) {
    throw new ApiError(400, "Avatar file is required");
  }

  const user = await User.create({
    fullName,
    avatar: avatar.url,
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

export { registerUser };
