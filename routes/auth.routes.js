const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const User = require('../models/User.model');
const Blacklist = require('../models/Blacklist.model');

const router = express.Router();

// POST /signup - register new user
router.post('/signup', async (req, res) => {
  try {
    const { username, email, password, role } = req.body;

    // basic validation
    if (!username || !email || !password) {
      return res.status(400).json({ message: 'username, email, and password are required' });
    }

    // check if user already exists
    const existingUser = await User.findOne({
      $or: [{ email }, { username }]
    });

    if (existingUser) {
      return res.status(400).json({ message: 'User with this email or username already exists' });
    }

    // hash password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // create user
    const newUser = new User({
      username,
      email,
      password: hashedPassword,
      role: role && ['admin', 'user'].includes(role) ? role : 'user'
    });

    await newUser.save();

    res.status(201).json({
      message: 'User registered successfully',
      user: {
        id: newUser._id,
        username: newUser.username,
        email: newUser.email,
        role: newUser.role,
        subscriptionPlan: newUser.subscriptionPlan
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error during signup', error: error.message });
  }
});

// POST /login - authenticate user and issue JWT tokens
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    // find user by email
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    // compare password
    const isPasswordMatch = await bcrypt.compare(password, user.password);
    if (!isPasswordMatch) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    // generate access token (15 mins) & refresh token (7 days)
    const accessToken = jwt.sign(
      { id: user._id, role: user.role, plan: user.subscriptionPlan },
      process.env.JWT_SECRET,
      { expiresIn: '15m' }
    );

    const refreshToken = jwt.sign(
      { id: user._id },
      process.env.JWT_REFRESH_SECRET,
      { expiresIn: '7d' }
    );

    res.status(200).json({
      message: 'Login successful',
      accessToken,
      refreshToken,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
        subscriptionPlan: user.subscriptionPlan
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error during login', error: error.message });
  }
});

// POST /logout - blacklist current tokens
router.post('/logout', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const { refreshToken } = req.body;

    // blacklist access token if provided
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const accessToken = authHeader.split(' ')[1];
      const exists = await Blacklist.findOne({ token: accessToken });
      if (!exists) {
        await Blacklist.create({ token: accessToken });
      }
    }

    // blacklist refresh token if provided
    if (refreshToken) {
      const exists = await Blacklist.findOne({ token: refreshToken });
      if (!exists) {
        await Blacklist.create({ token: refreshToken });
      }
    }

    res.status(200).json({ message: 'Logged out successfully. Tokens have been blacklisted.' });
  } catch (error) {
    res.status(500).json({ message: 'Server error during logout', error: error.message });
  }
});

// POST /refresh - issue new access token using refresh token
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({ message: 'Refresh token is required' });
    }

    // check if refresh token is blacklisted
    const isBlacklisted = await Blacklist.findOne({ token: refreshToken });
    if (isBlacklisted) {
      return res.status(401).json({ message: 'Refresh token has been blacklisted. Please login again.' });
    }

    // verify refresh token
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);

    // check if user still exists
    const user = await User.findById(decoded.id);
    if (!user) {
      return res.status(401).json({ message: 'User not found' });
    }

    // issue fresh access token (15 mins)
    const newAccessToken = jwt.sign(
      { id: user._id, role: user.role, plan: user.subscriptionPlan },
      process.env.JWT_SECRET,
      { expiresIn: '15m' }
    );

    res.status(200).json({
      message: 'Access token refreshed successfully',
      accessToken: newAccessToken
    });
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Refresh token has expired. Please login again.' });
    }
    return res.status(401).json({ message: 'Invalid refresh token' });
  }
});

module.exports = router;
