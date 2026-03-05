import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: false
  },
  phoneNo: {
    type: String,
    required: false
  },
  role: {
    type: String,
    required: false
  },
  gender: {
    type: String,
    required: false
  },
  mail: {
    type: String,
    required: false
  },
  alternateNo: {
    type: String,
    required: false
  },
  address: {
    type: String,
    required: false
  }
}, {
  timestamps: true
});

export default mongoose.model("User", userSchema);