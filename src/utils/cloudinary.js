import { v2 as cloudinary } from "cloudinary";
import fs from "fs";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const uploadOnCloudinary = async (localFilePath) => {
  try {
    const uploadedFileData = await cloudinary.uploader.upload(localFilePath, {
      resource_type: "auto",
    });

    // console.log(uploadedFileData);
    return uploadedFileData;
  } catch (err) {
    return null;
  } finally {
    // ✅ always runs (success or failure)
    try {
      if (localFilePath) fs.unlinkSync(localFilePath);
    } catch (err) {
      console.warn("Temp file deletion failed:", err.message);
    }
  }
};

const deleteFromCloudinary = async (public_id) => {
  try {
    const res = await cloudinary.uploader.destroy(public_id);
    if (res.result !== "ok") {
      console.warn("old image not found or already deleted");
    }
  } catch (error) {
    console.error("Cloudinary deletion failed:", error);
  }
};

export { uploadOnCloudinary, deleteFromCloudinary };
