import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import mailRoutes from "./routes/mailRoutes.js";
import uploadRoutes from "./routes/uploadRoutes.js";
import connectDB from "./config/db.js";
import User from "./models/User.js";

dotenv.config();

const app = express();
connectDB();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Middleware
app.use(express.urlencoded({ extended: false }));
app.use(express.json());


// View Engine
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Routes
app.get("/", (req, res) => {
  res.send("ROOT WORKING ✅");
});

app.get("/mail", (req, res) => {
  res.render("mail");
});


app.use("/api", mailRoutes);
app.use("/api/files", uploadRoutes);
app.use("/uploads", express.static(path.join(__dirname, "uploads")));


// Start Server
app.listen(process.env.PORT, () => {
  console.log(`Server started on port ${process.env.PORT} 🚀`);
});

