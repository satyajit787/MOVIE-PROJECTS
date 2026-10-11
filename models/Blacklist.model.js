const mongoose = require('mongoose');

const blacklistSchema = new mongoose.Schema({
  token: {
    type: String,
    required: true,
    unique: true
  },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: '7d' // automatically removed from db after 7 days
  }
});

const Blacklist = mongoose.model('Blacklist', blacklistSchema);
module.exports = Blacklist;
