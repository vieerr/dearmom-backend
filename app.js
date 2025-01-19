const cors = require("cors");
const express = require("express");
const cloudinary = require("cloudinary").v2;
const upload = require("./multer-config");
const app = express();
const dotenv = require("dotenv");

const textToSpeech = require("@google-cloud/text-to-speech");
const fs = require("fs");
const util = require("util");
const bodyParser = require("body-parser");


dotenv.config();

const base64Key = process.env.GTTS;

// Cloudinary configuration
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

app.use(cors());

app.use(bodyParser.json());


const keyFilePath = "./gcloud-key.json";
if (base64Key) {
  const buffer = Buffer.from(base64Key, "base64");
  fs.writeFileSync(keyFilePath, buffer);
}

const client = new textToSpeech.TextToSpeechClient({
  keyFilename:keyFilePath
});

console.log(client);

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

    const writeFile = util.promisify(fs.writeFile);
    await writeFile("./audios/output.mp3", response.audioContent, "binary");

    res.send(response.audioContent); // Send MP3 content directly to frontend
  } catch (error) {
    res.status(500).send(error.message);
  }
});

app.post("/upload", upload.single("image"), async (req, res) => {
  try {
    console.log(req.body);
    const result = await cloudinary.uploader.upload(req.body.image, {
      folder: "folder_name",
    });

    res.json({ imageUrl: result.secure_url });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error uploading image to Cloudinary" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
