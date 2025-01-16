const express = require('express');
const jwt = require('jsonwebtoken');
const session = require('express-session');
const multer = require('multer');
const path = require('path');
const mongoose = require('mongoose');
const app = express();
const upload = multer({ dest: 'uploads/' });
 
const PORT = process.env.PORT || 3000;
const SECRET_KEY = 'your_secret_key';
 
mongoose.set('strictQuery', false);
 
const uri = "mongodb://localhost:27017";
mongoose.connect(uri, { 'dbName': 'userDashboard' });
 
// Define the User schema with the new fields
const User = mongoose.model('User', { username: String, email: String, password: String ,firstName: String, lastName: String,mobile:String,gender:String,dob:Date,address:String,zipcode:String,country:String,city:String,state:String});
const Post = mongoose.model('Post', { userId: mongoose.Schema.Types.ObjectId,title: String, text: String, imageUrl: String });
 
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({ secret: SECRET_KEY, resave: false, saveUninitialized: true, cookie: { secure: false } }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
 
// Set EJS as the view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views')); // Set the views folder for EJS templates
 
 
 
function authenticateJWT(req, res, next) {
  const token = req.session.token;
 
  if (!token) return res.status(401).json({ message: 'Unauthorized' });
 
  try {
    const decoded = jwt.verify(token, SECRET_KEY);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Invalid token' });
  }
}
 
function requireAuth(req, res, next) {
  const token = req.session.token;
 
  if (!token) return res.redirect('/login');
 
  try {
    const decoded = jwt.verify(token, SECRET_KEY);
    req.user = decoded;
    next();
  } catch (error) {
    return res.redirect('/login');
  }
}
 
// Routes to render EJS templates
app.get('/', (req, res) => req.session.token? res.redirect("/index"):res.render('index', { username: req.user ? req.user.username : null, token:req.session.token}));
 
app.get('/register', (req, res) => res.render('register'));
 
 
app.get('/login', (req, res) =>req.session.token? res.redirect("/index"): res.render('login'));
 
app.get('/index', requireAuth, (req, res) => {
  const userId = req.user.userId; // Get userId from JWT payload
 
  // Fetch posts associated with the logged-in user
  Post.find({ userId })
    .then(posts => {
      res.render('index', { username: req.user.username, posts , token:req.session.token});  // Pass posts to the template
    })
    .catch(error => {
      console.error('Error fetching posts:', error);
      res.status(500).json({ message: 'Internal Server Error' });
    });
});
 
 
app.get('/post', requireAuth, (req, res) => res.render('posts'));
 
app.get('/posts', authenticateJWT, (req, res) => {
  const userId = req.user.userId;  // Extract userId from the authenticated user
 
  Post.find({ userId: userId }) // Fetch posts only for this user
  .sort({ _id: -1 })
    .then(posts => {
      if (posts.length === 0) {
        return res.status(404).json({ message: 'No posts found for this user' });
      }
      res.json({ posts });  // Send back the user's posts
    })
    .catch(err => {
      console.error(err);
      res.status(500).json({ message: 'Error fetching posts' });
    });
});
 
app.get('/posts/:postId', authenticateJWT, (req, res) => {
  const postId = req.params.postId;
 
  // Check if postId is a valid ObjectId (if you're using ObjectId in MongoDB)
  if (!ObjectId.isValid(postId)) {
    return res.status(400).json({ message: 'Invalid post ID format' });
  }
 
  // Fetch the post from the database
  Post.findById(postId)
    .then(post => {
      if (!post) {
        return res.status(404).json({ message: 'Post not found' });
      }
      res.json(post);  // Send the post as JSON
    })
    .catch(error => {
      res.status(500).json({ message: 'Error fetching post', error });
    });
});
 
 
app.get('/api/users', async (req, res) => {
  try {
    const users = await User.find();  // Find all users
    res.status(200).json(users);  // Return the users as a JSON response
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ message: 'Internal Server Error' });  // Handle errors
  }
});
 
//register
app.post('/register', async (req, res) => {
  const { firstName, lastName, email, username, mobile, gender, dob, address, zipcode, country, city, state, password, confirmPassword } = req.body;
 
  // Check if passwords match
  if (password !== confirmPassword) {
    return res.redirect('/register?error=Passwords do not match');
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
      password
    });
 
    await newUser.save();
 
    // Redirect to login page after successful registration
    res.redirect('/login');
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});
 
 
 
app.post('/login', async (req, res) => {
  const { username, password } = req.body;
 
   try {
    // Find the user based on username (ideally, password should be hashed)
    const user = await User.findOne({ username });
 
    if (!user || user.password !== password) {
      // If invalid credentials, redirect back to login with error message
      return res.redirect(`/login?error=Incorrect username or password`);
    //   console.log("error message");
    //   const errorMessage = "Incorrect username and password";
    //  return res.render('login',{error:errorMessage} );
    }
 
    // Generate the token
    const token = jwt.sign({ userId: user._id, username: user.username }, SECRET_KEY, { expiresIn: '1h' });
    // console.log(token);  // Log the generated token for debugging
 
    // Store the token in session for session-based authentication (optional)
    req.session.token = token;
    //console.log(token);
 
    // For Postman: Return the token as a response
    if (req.headers.accept && req.headers.accept.includes('application/json')) {
      return res.json({ token });  // Send the token as JSON
    }
 
    // For Browser: Redirect to the index page
    res.redirect('/index');
     // Optionally, you could send the token in a cookie instead
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});
 
// Create post
app.post('/posts', authenticateJWT, upload.single('image'), (req, res) => {
  const { title, text } = req.body;
  const imageUrl = req.file ? '/uploads/' + req.file.filename : '';
 
  console.log('Received post data:', title, text, imageUrl);
 
  if (!title || !text || typeof title !== 'string' || typeof text !== 'string') {
    return res.status(400).json({ message: 'Please provide a valid title and content' });
  }
 
  const newPost = new Post({
    userId: req.user.userId,
    title,
    text,
    imageUrl
  });
 
  newPost.save()
    .then(post => {
      res.status(201).json({ message: 'Post created successfully', postId: post._id });
    })
    .catch(err => {
      console.error('Error saving post:', err);
      res.status(500).json({ message: 'Error saving post' });
    });
});
 
 
//create user
app.post('/api/users', async (req, res) => {
  const { username, email, password } = req.body;
  try {
    const newUser = new User({ username, email, password });
    await newUser.save();
    res.status(201).json({ message: 'User created successfully', user: newUser });
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({ message: 'Error creating user' });
  }
});
 
 
app.put('/posts/:id', authenticateJWT, upload.single('image'), (req, res) => {
  const { title, text } = req.body;
  const imageUrl = req.file ? req.file.path : null;
 
  Post.findByIdAndUpdate(req.params.id, { title, text, imageUrl }, { new: true })
    .then(post => {
      if (!post) return res.status(404).json({ error: 'Post not found' });
      res.json({ success: true, post });
    })
    .catch(err => res.status(500).json({ error: 'Error updating post' }));
});
 
//update users
app.put('/api/users/:id', async (req, res) => {
  const userId = req.params.id;
  const { username, email, password } = req.body;
 
  try {
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { username, email, password },
      { new: true }
    );
 
    if (!updatedUser) {
      return res.status(404).json({ message: 'User not found' });
    }
 
    res.status(200).json({ message: 'User updated successfully', user: updatedUser });
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ message: 'Error updating user' });
  }
});
 
// Delete post
app.delete('/posts/:postId', authenticateJWT, (req, res) => {
  const postId = req.params.postId;
 
  Post.findOneAndDelete({ _id: postId, userId: req.user.userId })
    .then(deletedPost => {
      if (!deletedPost) return res.status(404).json({ message: 'Post not found' });
      res.json({ message: 'Post deleted successfully', deletedPost });
    })
    .catch(() => res.status(500).json({ message: 'Error deleting post' }));
});
 
//delete users
app.delete('/api/users/:id', async (req, res) => {
  const userId = req.params.id;
 
  try {
    const deletedUser = await User.findByIdAndDelete(userId);
 
    if (!deletedUser) {
      return res.status(404).json({ message: 'User not found' });
    }
 
    res.status(200).json({ message: 'User deleted successfully', user: deletedUser });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ message: 'Error deleting user' });
  }
});
 
// Logout
app.get('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) console.error(err);
    res.redirect('/login');
  });
});
 
// Start server
app.listen(PORT, () => console.log(`Server is running on port ${PORT}`));`  `