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

app.post("/register", async (req, res) => {
  const { name, email, password } = req.body;

  try {
    const hashedPwd = await bcrypt.hash(password, 10);
    const user = new User({
      name,
      email,
      password: hashedPwd,
    });
    const newUser = await user.save();

    const token = jwt.sign(
      { userId: newUser._id, contacts: [] },
      process.env.SECRET_KEY,
    );

    res.status(201).json({ token });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/me", async (req, res) => {
  let newToken;
  try {
    const token = req.header("Authorization")?.split(" ")[1];
    if (!token) return res.sendStatus(403);

    jwt.verify(token, process.env.SECRET_KEY, async (err, user) => {
      if (err) return res.sendStatus(403);

      const foundUser = await User.findById(user.userId);
      if (!user) return res.sendStatus(403);
      newToken = jwt.sign(
        { userId: foundUser._id, contacts: [user.contacts] },
        process.env.SECRET_KEY,
      );
    });
    res.status(200).json({ token: newToken });
  } catch (error) {
    console.error({ error });
  }
});

app.post("/login", async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ error: "Invalid credentials" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ error: "Invalid credentials" });

    const token = jwt.sign(
      { userId: user._id, contacts: user.contacts },
      process.env.SECRET_KEY,
    );
    res.status(200).json({ token });
  } catch (error) {
    res.status(500).json({ error: "Server login error" });
  }
});

app.patch("/add-contact", async (req, res) => {
  try {
    const userId = req.body._id;
    const found = await User.findOne({
      _id: new mongoose.Types.ObjectId(`${userId}`),
    });
    const updatedUser = await User.findOneAndUpdate(
      { _id: userId },
      {
        $push: {
          contacts: req.body.contact,
        },
      },
      { new: true },
    );
    res.status(200).json(updatedUser);
  } catch (error) {
    console.error({ error });
  }
});

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
