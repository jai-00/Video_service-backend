import fs from "fs";

const removeTempFiles = (localFilePath) => {
  fs.unlinkSync(localFilePath);
};

export default removeTempFiles;
