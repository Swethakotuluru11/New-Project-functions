const express = require("express");
const jwt = require("jsonwebtoken");
const session = require("express-session");
const multer = require("multer");
const path = require("path");
const mongoose = require("mongoose");
const app = express();
const upload = multer({ dest: "uploads/" });
 
const PORT = process.env.PORT || 3000;
const SECRET_KEY = "your_secret_key";
 
mongoose.set("strictQuery", false);
 
const uri = "mongodb://localhost:27017";
mongoose.connect(uri, { dbName: "userDashboard" });
 
const User = mongoose.model("User", {username: String,email: String,password: String,firstName: String,lastName: String,mobile: String,gender: String,dob: Date,address: String,zipcode: String,country: String,city: String,state: String,});
const Post = mongoose.model("Post", {
  userId: mongoose.Schema.Types.ObjectId,
  title: String,
  text: String,
  imageUrl: String,
});
 
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(
  session({
    secret: SECRET_KEY,
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false },
  })
);
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
 
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
 
function authenticateJWT(req, res, next) {
  const token = req.session.token;
 
  if (!token) return res.status(401).json({ message: "Unauthorized" });
 
  try {
    const decoded = jwt.verify(token, SECRET_KEY);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid token" });
  }
}
 
function requireAuth(req, res, next) {
  const token = req.session.token;
 
  if (!token) return res.redirect("/login");
 
  try {
    const decoded = jwt.verify(token, SECRET_KEY);
    req.user = decoded;
    next();
  } catch (error) {
    return res.redirect("/login");
  }
}
 
app.get("/", (req, res) => req.session.token? res.redirect("/index"): res.render("index", { username: req.user ? req.user.username : null, token: req.session.token, }));
 
app.get("/register", (req, res) => req.session.token ? res.redirect("/index") : res.render("register", { username: req.user ? req.user.username : null, token: req.session.token, }));
app.get("/login", (req, res) =>req.session.token ? res.redirect("/index"): res.render("login", { username: req.user ? req.user.username : null,  token: req.session.token,  }));
 
app.get("/index", requireAuth, (req, res) => {
  const userId = req.user.userId;
 
  Post.find({ userId })
    .then((posts) => {
      res.render("index", {
        username: req.user.username,
        posts,
        token: req.session.token,
      });
    })
    .catch((error) => {
      console.error("Error fetching posts:", error);
      res.status(500).json({ message: "Internal Server Error" });
    });
});
 
app.get("/post", requireAuth, (req, res) => res.render("posts"));
 
app.get("/posts", authenticateJWT, (req, res) => {
  const userId = req.user.userId;
 
  Post.find({ userId: userId })
    .sort({ _id: -1 })
    .then((posts) => {
      if (posts.length === 0) {
        return res
          .status(404)
          .json({ message: "No posts found for this user" });
      }
      res.json({ posts });
    })
    .catch((err) => {
      console.error(err);
      res.status(500).json({ message: "Error fetching posts" });
    });
});
 
app.get("/posts/:postId", authenticateJWT, (req, res) => {
  const postId = req.params.postId;
 
  if (!ObjectId.isValid(postId)) {
    return res.status(400).json({ message: "Invalid post ID format" });
  }
 
  Post.findById(postId)
    .then((post) => {
      if (!post) {
        return res.status(404).json({ message: "Post not found" });
      }
      res.json(post);
    })
    .catch((error) => {
      res.status(500).json({ message: "Error fetching post", error });
    });
});
 
app.get("/api/users", async (req, res) => {
  try {
    const users = await User.find();
    res.status(200).json(users);
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});
 
app.post("/register", async (req, res) => {
  const {
    firstName,
    lastName,
    email,
    username,
    mobile,
    gender,
    dob,
    address,
    zipcode,
    country,
    city,
    state,
    password,
    confirmPassword,
  } = req.body;
 
  if (password !== confirmPassword) {
    return res.redirect("/register?error=Passwords do not match");
  }
 
  try {
    const existingUser = await User.findOne({ $or: [{ username }, { email }] });
 
    if (existingUser)
      return res.redirect(`/register?error=User already exists`);
 
    const newUser = new User({
      firstName,
      lastName,
      email,
      username,
      mobile,
      gender,
      dob,
      address,
      zipcode,
      country,
      city,
      state,
      password,
    });
 
    await newUser.save();
 
    res.redirect("/login");
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});
 
app.post("/login", async (req, res) => {
  const { username, password } = req.body;
 
  try {
    const user = await User.findOne({ username });
 
    if (!user || user.password !== password) {
      return res.redirect(`/login?error=Incorrect username or password`);
    }
 
    const token = jwt.sign(
      { userId: user._id, username: user.username },
      SECRET_KEY,
      { expiresIn: "1h" }
    );
 
    req.session.token = token;
 
    if (req.headers.accept && req.headers.accept.includes("application/json")) {
      return res.json({ token });
    }
 
    res.redirect("/index");
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});
 
app.post("/posts", authenticateJWT, upload.single("image"), (req, res) => {
  const { title, text } = req.body;
  const imageUrl = req.file ? "/uploads/" + req.file.filename : "";
 
  console.log("Received post data:", title, text, imageUrl);
 
  if (
    !title ||
    !text ||
    typeof title !== "string" ||
    typeof text !== "string"
  ) {
    return res
      .status(400)
      .json({ message: "Please provide a valid title and content" });
  }
 
  const newPost = new Post({
    userId: req.user.userId,
    title,
    text,
    imageUrl,
  });
 
  newPost
    .save()
    .then((post) => {
      res
        .status(201)
        .json({ message: "Post created successfully", postId: post._id });
    })
    .catch((err) => {
      console.error("Error saving post:", err);
      res.status(500).json({ message: "Error saving post" });
    });
});
 
app.post("/api/users", async (req, res) => {
  const { username, email, password } = req.body;
  try {
    const newUser = new User({ username, email, password });
    await newUser.save();
    res
      .status(201)
      .json({ message: "User created successfully", user: newUser });
  } catch (error) {
    console.error("Error creating user:", error);
    res.status(500).json({ message: "Error creating user" });
  }
});
 
app.put("/posts/:id", authenticateJWT, upload.single("image"), (req, res) => {
  const { title, text } = req.body;
  const imageUrl = req.file ? req.file.path : null;
 
  Post.findById(req.params.id)
    .then((post) => {
      if (!post) return res.status(404).json({ error: "Post not found" });
 
      const updateData = {};
 
      if (title) updateData.title = title;
      if (text) updateData.text = text;
      if (imageUrl) updateData.imageUrl = imageUrl;
 
      return post.updateOne(updateData);
    })
    .then((updatedPost) => {
      res.json({ success: true, post: updatedPost });
    })
    .catch((err) => res.status(500).json({ error: "Error updating post" }));
});
 
app.put("/api/users/:id", async (req, res) => {
  const userId = req.params.id;
  const { username, email, password } = req.body;
 
  try {
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { username, email, password },
      { new: true }
    );
 
    if (!updatedUser) {
      return res.status(404).json({ message: "User not found" });
    }
 
    res
      .status(200)
      .json({ message: "User updated successfully", user: updatedUser });
  } catch (error) {
    console.error("Error updating user:", error);
    res.status(500).json({ message: "Error updating user" });
  }
});
 
app.delete("/posts/:postId", authenticateJWT, (req, res) => {
  const postId = req.params.postId;
 
  Post.findOneAndDelete({ _id: postId, userId: req.user.userId })
    .then((deletedPost) => {
      if (!deletedPost)
        return res.status(404).json({ message: "Post not found" });
      res.json({ message: "Post deleted successfully", deletedPost });
    })
    .catch(() => res.status(500).json({ message: "Error deleting post" }));
});
 
app.delete("/api/users/:id", async (req, res) => {
  const userId = req.params.id;
 
  try {
    const deletedUser = await User.findByIdAndDelete(userId);
 
    if (!deletedUser) {
      return res.status(404).json({ message: "User not found" });
    }
 
    res
      .status(200)
      .json({ message: "User deleted successfully", user: deletedUser });
  } catch (error) {
    console.error("Error deleting user:", error);
    res.status(500).json({ message: "Error deleting user" });
  }
});
 
app.get("/logout", (req, res) => {
  //console.log("logged out");
  //console.log(req.session);
  req.session.destroy((err) => {
    //console.log("i am inside destroyed method");
    if (err) {
      console.error(err);
    }
    //console.log("after error");
    res.redirect("/login");
  });
});
 
app.listen(PORT, () => console.log(`Server is running on port ${PORT}`));
`  `;