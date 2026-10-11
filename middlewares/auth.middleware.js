const jwt = require('jsonwebtoken');
const Blacklist = require('../models/Blacklist.model');
const User = require('../models/User.model');

const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    // check if authorization header is provided
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Access token is missing or invalid' });
    }

    const token = authHeader.split(' ')[1];

    // check if token is blacklisted in database
    const isBlacklisted = await Blacklist.findOne({ token });
    if (isBlacklisted) {
      return res.status(401).json({ message: 'Token has been blacklisted. Please login again.' });
    }

    // verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // fetch current user from database
    const user = await User.findById(decoded.id);
    if (!user) {
      return res.status(401).json({ message: 'User not found or account inactive' });
    }

    // auto-downgrade logic: check dynamic expiry (30 days)
    if (user.subscriptionPlan !== 'free' && user.subscriptionEndDate) {
      if (new Date() > new Date(user.subscriptionEndDate)) {
        user.subscriptionPlan = 'free';
        user.subscriptionStartDate = null;
        user.subscriptionEndDate = null;
        await user.save();
      }
    }

    req.user = user;
    req.token = token;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Token has expired. Please refresh your token or login again.' });
    }
    return res.status(401).json({ message: 'Authentication failed: Invalid token' });
  }
};

module.exports = authMiddleware;
