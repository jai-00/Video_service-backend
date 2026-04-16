const asyncHandler = (fn) => {
  return (req, res, next) => {
    console.log("TYPE OF NEXT:", typeof next);

    Promise.resolve(fn(req, res, next)).catch((error) => {
      console.log("ERROR CAUGHT:", error);
      next(error);
    });
  };
};

export { asyncHandler };
