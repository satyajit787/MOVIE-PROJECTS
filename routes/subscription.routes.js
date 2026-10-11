const express = require('express');
const authMiddleware = require('../middlewares/auth.middleware');
const roleMiddleware = require('../middlewares/role.middleware');
const User = require('../models/User.model');

const router = express.Router();

// POST /subscribe - user purchases a subscription (premium or pro)
router.post('/subscribe', authMiddleware, async (req, res) => {
  try {
    const { plan } = req.body;

    if (!plan || !['premium', 'pro', 'free'].includes(plan.toLowerCase())) {
      return res.status(400).json({ message: 'Invalid plan. Please choose free, premium, or pro.' });
    }

    const selectedPlan = plan.toLowerCase();
    const user = req.user;

    if (selectedPlan === 'free') {
      user.subscriptionPlan = 'free';
      user.subscriptionStartDate = null;
      user.subscriptionEndDate = null;
      await user.save();
      return res.status(200).json({
        message: 'Subscribed to free plan',
        plan: 'free'
      });
    }

    // dynamic expiry: 30 days from now
    const now = new Date();
    const thirtyDaysLater = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    user.subscriptionPlan = selectedPlan;
    user.subscriptionStartDate = now;
    user.subscriptionEndDate = thirtyDaysLater;
    await user.save();

    res.status(200).json({
      message: `Successfully subscribed to ${selectedPlan} plan`,
      plan: user.subscriptionPlan,
      startDate: user.subscriptionStartDate,
      endDate: user.subscriptionEndDate
    });
  } catch (error) {
    res.status(500).json({ message: 'Error processing subscription', error: error.message });
  }
});

// GET /subscription-status - check validity and auto-downgrade if expired
router.get('/subscription-status', authMiddleware, async (req, res) => {
  try {
    const user = req.user;

    // if user is on free plan
    if (user.subscriptionPlan === 'free' || !user.subscriptionEndDate) {
      return res.status(200).json({
        plan: 'free',
        isActive: false,
        message: 'User is on the free plan'
      });
    }

    // check if subscription has expired
    const currentDate = new Date();
    if (currentDate > new Date(user.subscriptionEndDate)) {
      // auto-downgrade to free
      user.subscriptionPlan = 'free';
      user.subscriptionStartDate = null;
      user.subscriptionEndDate = null;
      await user.save();

      return res.status(200).json({
        plan: 'free',
        isActive: false,
        isExpired: true,
        message: 'Subscription has expired and auto-downgraded to free plan'
      });
    }

    // subscription is still active
    const timeDiff = new Date(user.subscriptionEndDate) - currentDate;
    const daysRemaining = Math.ceil(timeDiff / (1000 * 60 * 60 * 24));

    res.status(200).json({
      plan: user.subscriptionPlan,
      isActive: true,
      isExpired: false,
      startDate: user.subscriptionStartDate,
      endDate: user.subscriptionEndDate,
      daysRemaining,
      benefits:
        user.subscriptionPlan === 'pro'
          ? 'Full access to premium content + 20% discount on store purchases'
          : 'Full access to free and premium content'
    });
  } catch (error) {
    res.status(500).json({ message: 'Error checking subscription status', error: error.message });
  }
});

// PATCH /renew - renew subscription before expiry
router.patch('/renew', authMiddleware, async (req, res) => {
  try {
    const user = req.user;

    // check if user has an active non-free subscription
    if (user.subscriptionPlan === 'free' || !user.subscriptionEndDate) {
      return res.status(400).json({
        message: 'No active subscription found to renew. Please purchase a plan via /subscribe.'
      });
    }

    const currentDate = new Date();

    // if already expired, must buy new subscription
    if (currentDate > new Date(user.subscriptionEndDate)) {
      // auto downgrade to free
      user.subscriptionPlan = 'free';
      user.subscriptionStartDate = null;
      user.subscriptionEndDate = null;
      await user.save();

      return res.status(400).json({
        message: 'Subscription already expired. You must purchase a new subscription via /subscribe.'
      });
    }

    // renew before expiry: extend by 30 days from current expiry
    const currentEnd = new Date(user.subscriptionEndDate);
    const newEnd = new Date(currentEnd.getTime() + 30 * 24 * 60 * 60 * 1000);

    user.subscriptionEndDate = newEnd;
    await user.save();

    res.status(200).json({
      message: 'Subscription renewed successfully for another 30 days',
      plan: user.subscriptionPlan,
      newExpiryDate: user.subscriptionEndDate
    });
  } catch (error) {
    res.status(500).json({ message: 'Error renewing subscription', error: error.message });
  }
});

// POST /cancel-subscription - cancel subscription manually
router.post('/cancel-subscription', authMiddleware, async (req, res) => {
  try {
    const user = req.user;

    if (user.subscriptionPlan === 'free') {
      return res.status(400).json({ message: 'User is already on the free plan' });
    }

    // downgrade to free
    user.subscriptionPlan = 'free';
    user.subscriptionStartDate = null;
    user.subscriptionEndDate = null;
    await user.save();

    res.status(200).json({
      message: 'Subscription cancelled successfully. You are now on the free plan.'
    });
  } catch (error) {
    res.status(500).json({ message: 'Error cancelling subscription', error: error.message });
  }
});

// Admin routes: Admins can manage subscriptions
// GET /admin/subscriptions - view all users subscriptions
router.get('/admin/subscriptions', authMiddleware, roleMiddleware(['admin']), async (req, res) => {
  try {
    const users = await User.find({}, 'username email role subscriptionPlan subscriptionStartDate subscriptionEndDate');
    res.status(200).json({
      message: 'All subscriptions fetched successfully',
      count: users.length,
      users
    });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching subscriptions', error: error.message });
  }
});

// PATCH /admin/subscription/:userId - admin updates user subscription
router.patch('/admin/subscription/:userId', authMiddleware, roleMiddleware(['admin']), async (req, res) => {
  try {
    const { userId } = req.params;
    const { plan, extendDays } = req.body;

    const targetUser = await User.findById(userId);
    if (!targetUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (plan && ['free', 'premium', 'pro'].includes(plan.toLowerCase())) {
      targetUser.subscriptionPlan = plan.toLowerCase();
      if (plan.toLowerCase() === 'free') {
        targetUser.subscriptionStartDate = null;
        targetUser.subscriptionEndDate = null;
      } else {
        const now = new Date();
        const days = extendDays ? Number(extendDays) : 30;
        targetUser.subscriptionStartDate = now;
        targetUser.subscriptionEndDate = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
      }
    }

    await targetUser.save();

    res.status(200).json({
      message: `User subscription updated to ${targetUser.subscriptionPlan}`,
      user: {
        id: targetUser._id,
        username: targetUser.username,
        plan: targetUser.subscriptionPlan,
        endDate: targetUser.subscriptionEndDate
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Error updating user subscription', error: error.message });
  }
});

module.exports = router;
