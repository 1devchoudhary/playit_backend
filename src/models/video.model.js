import mongoose, {Schema} from "mongoose";
import mongooseAggregatePaginate from "mongoose-aggregate-paginate-v2";

const videoSchema = new Schema(
    {
        videoFile: {
            type: String,
            required: true
        },
        thubmnail: {
            type: String,
            required: true
        },
        owner: {
            type: Schema.Types.ObjectId,
            ref: "User",
        },
        title: {
            type: String,
            required: true
        },
        description: {
            type: String,
            required: true
        },
        duration: {
            type: Number
        },
        views: {
            type: Number,
            default: 0
        },
        isPublished: {
            type: Boolean,
            dafault: true
        }
    },{timestamps: true})

    videoSchema.plugin(mongooseAggregatePaginate)
    export const Video = Schema.model("Video",videoSchema);