import XLSX from "xlsx";
import User from "../models/User.js";

export const uploadExcel = async (req, res) => {
  try {
    const filePath = req.file.path;

    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const rawData = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);

    console.log("Excel Data:", rawData);

   const formattedData = rawData.map(row => ({
  name: row["Name"],
  phoneNo: row["Phone No"]?.toString(),
  role: row["Role"],
  gender: row["Gender"],
  mail: null,
  alternateNo: null,
  address: null
}));

await User.insertMany(formattedData);

    res.json({ message: "File uploaded & data saved ✅" });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Something went wrong" });
  }
};

// import XLSX from "xlsx";
// import fs from "fs";

// export const uploadExcel = (req, res) => {
//   try {
//     if (!req.file) {
//       return res.status(400).json({
//         message: "No file uploaded"
//       });
//     }

//     const filePath = req.file.path;

//     // Read Excel
//     const workbook = XLSX.readFile(filePath);
//     const sheetName = workbook.SheetNames[0];

//     const data = XLSX.utils.sheet_to_json(
//       workbook.Sheets[sheetName]
//     );

//     console.log("Excel Data:", data);

//     // Optional: Delete file after reading
//    // fs.unlinkSync(filePath);

//     return res.status(200).json({
//       message: "File uploaded successfully ✅",
//       data
//     });

//   } catch (error) {
//     console.error(error);
//     return res.status(500).json({
//       message: "Error reading file ❌"
//     });
//   }
// };