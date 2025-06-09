import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { User } from "../models/user.model.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
const generateAccessAndRefreshToken = async (userId) => {
  try {
    const user = await User.findOne(userId);
    const accessToken = user.generateAccessToken();
    const refreshToken = user.generateRefreshToken();

    user.refreshToken = refreshToken;
    await user.save({ validationBeforeSave: false });

    return { accessToken, refreshToken };
  } catch (error) {
    throw new ApiError(500, "Access or refresh token is not generating !");
  }
};
const registerUser = asyncHandler(async (req, res) => {
  const { username, fullname, email, password } = req.body;
  //console.log(email)

  if (
    [fullname, username, password, email].some((field) => field?.trim() === "")
  ) {
    throw new ApiError(400, "All fields are required to fill");
  }

  const existedUser = await User.findOne({
    $or: [{ email }, { username }],
  });

  if (existedUser) {
    throw new ApiError(406, "User already exist");
  }

  const avatarLocalPath = req.files?.avatar[0]?.path;

  let coverImageLocalPath;

  if (
    req.files &&
    Array.isArray(req.files.coverImage) &&
    req.files.coverImage.lenght > 0
  ) {
    coverImageLocalPath = req.files.coverImage[0].path;
  }
  if (!avatarLocalPath) {
    throw new ApiError(400, "Avatar is required");
  }

  const avatar = await uploadOnCloudinary(avatarLocalPath);
  const coverImage = await uploadOnCloudinary(coverImageLocalPath);

  if (!avatar) {
    throw new ApiError(400, "Avatar is  required");
  }

  const user = await User.create({
    username: username.toLowerCase(),
    fullname,
    email,
    password,
    avatar: avatar.url,
    coverImage: coverImage?.url || "",
  });

  const createdUser = await User.findById(user._id).select(
    "-password -refreshToken"
  );

  if (!createdUser) {
    throw new ApiError(500, "Sever not responding !");
  }

  return res
    .status(201)
    .json(new ApiResponse(200, createdUser, "User registered Successsfully."));
});

const loginUser = asyncHandler(async (req, res, next) => {
  const { username, email, password } = req.body;

  if (!email && !username) {
    throw new ApiError(400, "Username or email in required!");
  }

  const user = await User.findOne({
    $or: [{ email }, { username }],
  });

  if (!user) {
    throw new ApiError(404, "User not exist !");
  }

  const isPasswordVaild = await user.isPasswordCorrect(password);

  if (!isPasswordVaild) {
    throw new ApiError(401, "Invalid password !");
  }

  const { accessToken, refreshToken } = await generateAccessAndRefreshToken(
    user._id
  );

  const loggedInUser = await User.findOne(user._id).select(
    "-password -refreshToken"
  );

  const options = {
    httpOnly: true,
    secure: true,
  };

  return (
    res
      .status(200)
      .cookie("accessToken", accessToken, options)
      .cookie("refreshToken", refreshToken, options)
      .json(
        new ApiResponse(200, {
          user: loggedInUser,
          accessToken,
          refreshToken,
        })
      ),
    "User logged in successfully !!"
  );
});

const logoutUser = asyncHandler(async (req, res) => {
  await User.findByIdAndUpdate(
    req.user._id,
    {
      $set: { refreshToken: undefined },
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
    .json(new ApiResponse(200, {}, "User logged Out !!"));
});

const refreshAccessToken = asyncHandler(async (req, res) => {
  const incomingRefreshToken =
    req.cookies.refreshToken || req.body.refreshToken;

  if (!incomingRefreshToken) {
    throw new ApiError(401, "Unauthorized request");
  }

  try {
    const decodedRefreshToken = jwt.verify(
      incomingRefreshToken,
      process.env.REFRESH_TOKEN_SECRET
    );

    const user = await User.findById(decodedRefreshToken?._id);

    if (!user) {
      throw new ApiError(401, "Invalid refresh token");
    }

    if (incomingRefreshToken !== user?.refreshToken) {
      throw new ApiError(401, "Refresh is expired or used ! ");
    }

    const options = {
      httpOnly: true,
      secure: true,
    };

    const { accessToken, newRefreshToken } =
      await generateAccessAndRefreshToken(user._id);

    return res
      .status(200)
      .cookie("accessToken", accessToken, options)
      .cookie("refreshToken", newRefreshToken, options)
      .json(
        new ApiResponse(
          200,
          {
            accessToken,
            refreshToken: newRefreshToken,
          },
          "Access token refreshed !!"
        )
      );
  } catch (error) {
    throw new ApiError(401, error?.message || "Invalid Access token");
  }
});

const changeCurrentPassword = asyncHandler(async (req, res) => {
  const { oldPassword, newPassword } = req.body;

  const user = User.findById(req.user?._id);
  const isPasswordCorrect = await user.isPasswordCorrect(oldPassword);

  if (!isPasswordCorrect) {
    throw new ApiError(400, "Invalid old password");

    user.password = newPassword;
    await user.save({ validationBeforeSave: false });

    return res
      .status(200)
      .json(new ApiResp onse(200, {}, "Password changed successfully !!"));
  }
});

const getCurrentUser = asyncHandler(async (req, res) => {
  return res
    .status(200)
    .json(200, req.user, "Current user fatched successfully !!");
});

const updateAccountDetails = asyncHandler(async (req, res) => {
  const { fullname, email } = req.body;

  if (!fullname || !email) {
    throw new ApiError(400, "Provide details to update.");
  }

  const user = await User.findByIdAndUpdate(
    req.user?._id,
    {
      $set: {
        fullname,
        email,
      },
    },
    { new: true }
  ).select("-password");

  return res
    .status(200)
    .json(new ApiResponse(200, user, "Information updated successfully !!"));
});

const updateUserCoverImage = asyncHandler(async (req, res) => {
  const coverImageLocalPath = req.file?.path;

  if (!coverImageLocalPath) {
    throw ApiError(400, "Please upload a file.");
  }

  const coverImage = await uploadOnCloudinary(coverImageLocalPath);

  if (!coverImage.url) {
    throw ApiError(400, "Cover Image url is missing from cloudinary.");
  }

  const user = await User.findByIdAndUpdate(
    req.user?._id,
    {
      $set: {
        coverImage: coverImage.url,
      },
    },
    {
      new: true,
    }
  ).select("-password");

  return res
    .status(200)
    .json(new ApiResponse(200, user, "Cover Image uploaded successfully !!"));
});
const updateUserAvatar = asyncHandler(async (req, res) => {
  const avatarLocalPath = req.file?.path;

  if (!avatarLocalPath) {
    throw ApiError(400, "Please upload a file.");
  }

  const avatar = await uploadOnCloudinary(avatarLocalPath);

  if (!avatar.url) {
    throw ApiError(400, "Avatar url is missing from cloudinary.");
  }

  const user = await User.findByIdAndUpdate(
    req.user?._id,
    {
      $set: {
        avatar: avatar.url,
      },
    },
    {
      new: true,
    }
  ).select("-password");

  return res
    .status(200)
    .json(new ApiResponse(200, user, "Avatar Image uploaded successfully !!"));
});

const getUserChannelProfile = asyncHandler(async (req,res) => {
  const { username } = req.params

  if(!username?.trim()){
    throw new ApiError(400, "username is missing")
  }

  const channel = await User.aggregate([
    {
      $match: {
        username:  username?.toLowerCase()
      }
    },
    {
      $lookup: {
        from: "subscriptions",
        localField: "_id",
        foreignField: "channel",
        as: "subscribers"
      }
    },
    {
      $lookup: {
        from:"subscriptions",
        localField:"_id",
        foreignField:"subscriber",
        as:"subscribedTo"
      }
    },
    {
      $addFields:{
        subscriberCount:{
          $size: "$subscribers"
        },
        channelSubscribedToCount:{
          $size: "$subscribedTo"
        },
        isSubscribed:{
          $cond:{
            if:{$in:[req.user?._id,"$subscribers.subscriber"]},
            then:true,
            else: false
          }
        }
      }
    },
    {
      $project:{
        fullname:1,
        username: 1,
        email:1,
        avatar:1,
        coverImage:1,
        subscriberCount:1,
        channelSubscribedToCount:1,
        isSubscribed:1
      }
    }
  ])

  if(!channel?.lenght){
    throw new ApiError(400,"Channel does not exists !")
  }

  return res
  .status(200)
  .json(
    new ApiResponse(200,channel[0],"User channel fatched successfully !!")
  )

});

const getWatchHistory =  asyncHandler(async(req, res) => {
  const user = await User.aggregate([
    {
      $match:{
        _id: new mongoose.Types.ObjectId(req.user._id)
      }
    },
    {
      $lookup:{
        from:"videos",
        localField:"watchHistory",
        foreignField:"_id",
        as:"watchHistory",
        pipeline:[
          {
            $lookup:{
              from:"users",
              localField:"owner",
              foreignField:"_id",
              as:"owner",
              pipeline:[
                {
                  $project:{
                    fullname:1,
                    username:1,
                    avatar:1
                  }
                }
              ]
            }
          }
        ]
      }
    },
    {
      $addFields:{
        owner:{
          $first:"$owner"
        }
      }
    }

  ])

  return res
  .status(200)
  .json(
    new ApiResponse(200, user[0].watchHistory, "Watch history fatched successfully !!")
  )
})

export {
  registerUser,
  loginUser,
  logoutUser,
  refreshAccessToken,
  changeCurrentPassword,
  getCurrentUser,
  updateAccountDetails,
  updateUserAvatar,
  updateUserCoverImage,
  getUserChannelProfile,
  getWatchHistory
};
