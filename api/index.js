const cors = require("cors");
const express = require("express");
const cloudinary = require("cloudinary").v2;
const upload = require("../multer-config.js");
const app = express();
const dotenv = require("dotenv");
const jwt = require("jsonwebtoken");

const textToSpeech = require("@google-cloud/text-to-speech");
const fs = require("fs");
const util = require("util");
const bodyParser = require("body-parser");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const userRouter = require("./user.controller.js");
const User = require("./user.model.js");

dotenv.config();

const base64Key = process.env.GTTS;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => {
    console.log("Connected to MongoDB");
  })
  .catch((error) => {
    console.error("Error connecting to MongoDB", error.message);
  });

app.use(cors());

app.use(bodyParser.json());

const keyFilePath = "./gcloud-key.json";
if (base64Key) {
  if (!fs.existsSync(keyFilePath)) {
    const buffer = Buffer.from(base64Key, "base64");
    fs.writeFileSync(keyFilePath, buffer);
  }
}

const client = new textToSpeech.TextToSpeechClient({
  keyFilename: keyFilePath,
});

app.get("/", async (req, res) => {
  res.send("Dearmom backend");
});

app.post("/synthesize", async (req, res) => {
  const { text } = req.body;
  if (!text) {
    return res.status(400).send("Text is required");
  }

  const request = {
    input: { text },
    voice: { languageCode: "es-EC", ssmlGender: "FEMALE" },
    audioConfig: { audioEncoding: "MP3" },
  };

  try {
    const [response] = await client.synthesizeSpeech(request);

    res.set({
      "Content-Type": "audio/mpeg",
      "Content-Disposition": 'attachment; filename="output.mp3"',
      "Content-Length": response.audioContent.length,
    });

    // Save audio content to local
    const writeFile = util.promisify(fs.writeFile);
    await writeFile("./audios/output.mp3", response.audioContent, "binary");

    res.send(response.audioContent); // Send MP3 content directly to frontend
  } catch (error) {
    res.status(500).send(error.message);
  }
});

app.post("/upload", upload.single("image"), async (req, res) => {
  try {
    const result = await cloudinary.uploader.upload(req.body.image, {
      folder: "dearmom",
    });

    res.json({ imageUrl: result.secure_url });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error uploading image to Cloudinary" });
  }
});

app.use("", userRouter);

// const authenticateJWT = (req, res, next) => {
//     const token = req.header('Authorization')?.split(' ')[1];
//     if (!token) return res.sendStatus(403);

//     jwt.verify(token, process.env.SECRET_KEY, (err, user) => {
//         if (err) return res.sendStatus(403);
//         req.userId = user.userId;
//         next();
//     });
// };

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

module.exports = app;