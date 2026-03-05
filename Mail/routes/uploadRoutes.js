import express from "express";
import upload from "../config/multerConfig.js";
import { uploadExcel } from "../controllers/uploadController.js";

const router = express.Router();

router.post("/upload", upload.single("excelFile"), uploadExcel);

export default router;
// import express from "express";
// import upload from "../config/multerConfig.js";
// import { uploadExcel } from "../controllers/uploadController.js";

// const router = express.Router();

// router.post("/upload", upload.single("excelFile"), uploadExcel);

// export default router;