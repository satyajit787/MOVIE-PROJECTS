const express = require('express');
const cors = require('cors');
require('dotenv').config();

const connectDB = require('./config/db');
const authRoutes = require('./routes/auth.routes');
const subscriptionRoutes = require('./routes/subscription.routes');
const contentRoutes = require('./routes/content.routes');

const app = express();
const PORT = process.env.PORT || 8080;

// built-in and 3rd party middlewares
app.use(cors());
app.use(express.json());

// test route
app.get('/', (req, res) => {
  res.status(200).json({ message: 'L2 Auth and Subscription API is running' });
});

// mount routes directly to match requirement specs
app.use('/', authRoutes);
app.use('/', subscriptionRoutes);
app.use('/content', contentRoutes);

// mount routes under /api prefix for flexibility
app.use('/api', authRoutes);
app.use('/api', subscriptionRoutes);
app.use('/api/content', contentRoutes);

// 404 handler for unknown routes
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

// start server after connecting to database
const startServer = async () => {
  await connectDB();
  app.listen(PORT, () => {
    console.log(`Server started on port ${PORT}`);
  });
};

startServer();

module.exports = app;
