const express = require("express");
const nodemailer = require("nodemailer");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const User = require("./user.model.js");
const mongoose = require("mongoose");
const axios = require("axios");
const uuid = require("uuid").v4;
const dotenv = require("dotenv");
dotenv.config();

const router = express.Router();

router.post("/register", async (req, res) => {
  const { name, email, password, pin } = req.body;

  try {
    const hashedPwd = await bcrypt.hash(password, 10);
    const user = new User({
      name,
      email,
      password: hashedPwd,
      pin,
      contacts: [
        {
          id: uuid(),
          name: "mom",
          email: "",
          color: "#f472b6",
          icon: "woman",
        },
        {
          id: uuid(),
          name: "dad",
          email: "",
          color: "#60a5fa",
          icon: "man",
        },
      ],
    });
    const newUser = await user.save();

    const token = jwt.sign(
      { userId: newUser._id, contacts: [], pin },
      process.env.SECRET_KEY
    );

    res.status(201).json({ token });
  } catch (error) {
    res.status(500).send({ message: error.message });
  }
});

router.get("/me", async (req, res) => {
  try {
    const token = req.header("Authorization")?.split(" ")[1];
    if (!token) return res.sendStatus(403);

    const user = await new Promise((resolve, reject) => {
      jwt.verify(token, process.env.SECRET_KEY, (err, decoded) => {
        if (err) reject(err);
        else resolve(decoded);
      });
    });

    const foundUser = await User.findById(user.userId);
    console.log(foundUser);

    if (!foundUser) return res.sendStatus(403);

    const newToken = jwt.sign(
      {
        userId: foundUser._id,
        contacts: foundUser.contacts,
        pin: foundUser.pin,
      },
      process.env.SECRET_KEY
    );

    res.status(200).json({ token: newToken });
  } catch (error) {
    console.error({ error });
    if (
      error.name === "TokenExpiredError" ||
      error.name === "JsonWebTokenError"
    ) {
      return res.sendStatus(403);
    }
    res.sendStatus(500);
  }
});

router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(401).send({ message: "Invalid credentials" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).send({ message: "Invalid credentials" });

    const token = jwt.sign(
      { userId: user._id, contacts: user.contacts, pin: user.pin },
      process.env.SECRET_KEY
    );
    res.status(200).json({ token });
  } catch (error) {
    res.status(500).send({ error: "Server login error" });
  }
});

router.patch("/add-contact", async (req, res) => {
  try {
    const userId = req.body._id;
    const found = await User.findOne({
      _id: new mongoose.Types.ObjectId(`${userId}`),
    });
    const updatedUser = await User.findOneAndUpdate(
      { _id: userId },
      {
        $push: {
          contacts: { ...req.body.contact, id: uuid() },
        },
      },
      { new: true }
    );
    res.status(200).json(updatedUser);
  } catch (error) {
    console.error({ error });
  }
});

router.delete("/delete-contact", async (req, res) => {
  try {
    const { userId, contactId } = req.body;

    // Validate input
    if (!userId || !contactId) {
      return res
        .status(400)
        .json({ error: "userId and contactId are required" });
    }
    // Find the user and remove the contact by name
    const updatedUser = await User.findOneAndUpdate(
      { _id: new mongoose.Types.ObjectId(`${userId}`) },
      { $pull: { contacts: { id: contactId } } },
      { new: true }
    );

    if (!updatedUser) {
      return res.status(404).json({ error: "User not found" });
    }
    res.status(202).json(updatedUser.contacts);
  } catch (error) {
    console.error({ error });
    res.status(500).json({ error: "Server error while deleting contact" });
  }
});

router.put("/update-contact", async (req, res) => {
  try {
    const { userId, contactId, updatedContact } = req.body;
    // Validate input
    if (!userId || !contactId || !updatedContact) {
      return res.status(400).json({
        error: "userId, contactId, and updatedContact are required",
      });
    }

    // Find the user and update the contact by name
    const updatedUser = await User.findOneAndUpdate(
      {
        _id: new mongoose.Types.ObjectId(userId),
        "contacts.id": contactId,
      },
      { $set: { "contacts.$": updatedContact } },
      { new: true }
    );

    if (!updatedUser) {
      return res.status(404).json({ error: "User or contact not found" });
    }

    res.status(200).json(updatedUser);
  } catch (error) {
    console.error({ error });
    res.status(500).json({ error: "Server error while updating contact" });
  }
});

// Create a transporter object using Gmail SMTP
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.GMAIL_USER, // Load from .env
    pass: process.env.GMAIL_PASS, // Load from .env
  },
});

// Route to send email with embedded image
router.post("/send-email", async (req, res) => {
  const { recipientEmail, imageUrl, name } = req.body;

  if (!recipientEmail || !imageUrl) {
    return res
      .status(400)
      .json({ message: "Recipient email and image URL are required." });
  }

  try {
    // Fetch the image from Cloudinary or your backend
    const imageResponse = await axios.get(imageUrl, {
      responseType: "arraybuffer",
    });
    const imageBuffer = Buffer.from(imageResponse.data, "binary");

    // Email options
    const mailOptions = {
      from: process.env.GMAIL_USER, // Sender address
      to: recipientEmail, // Recipient address
      subject: `Dear ${name}, a new letter just arrived!`, // Subject line
      html: `
        <p>Here's a letter for you:</p>
        <img src="cid:unique-image-id" alt="Letter" style="width: 400px; height: auto;" />
        <a href="https://dearmom.vercel.app" target="_blank" rel="noopener noreferrer">Powered by Dear Mom</a>!
      `, // HTML body with embedded image
      attachments: [
        {
          filename: "letter.png", // Name of the attachment
          content: imageBuffer, // Image buffer
          cid: "unique-image-id", // Content-ID to reference in the HTML
        },
      ],
    };

    // Send the email
    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.error("Error sending email:", error);
        return res
          .status(500)
          .json({ message: "Failed to send email.", error: error.message });
      } else {
        console.log("Email sent:", info.response);
        return res
          .status(200)
          .json({ message: "Email sent successfully!", info });
      }
    });
  } catch (error) {
    console.error("Error fetching image:", error);
    return res
      .status(500)
      .json({ message: "Failed to fetch image.", error: error.message });
  }
});

module.exports = router;
