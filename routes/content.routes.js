const express = require('express');
const authMiddleware = require('../middlewares/auth.middleware');
const roleMiddleware = require('../middlewares/role.middleware');
const Content = require('../models/Content.model');

const router = express.Router();

// GET /content/free - accessible to all authenticated users
router.get('/free', authMiddleware, async (req, res) => {
  try {
    const freeContent = await Content.find({ contentType: 'free' });
    res.status(200).json({
      message: 'Free content fetched successfully',
      count: freeContent.length,
      data: freeContent
    });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching free content', error: error.message });
  }
});

// GET /content/premium - accessible only by Premium/Pro users (or Admin)
router.get('/premium', authMiddleware, async (req, res) => {
  try {
    const user = req.user;

    // check if user has premium or pro subscription or is admin
    const canAccess =
      user.role === 'admin' ||
      user.subscriptionPlan === 'premium' ||
      user.subscriptionPlan === 'pro';

    if (!canAccess) {
      return res.status(403).json({
        message: 'Access denied: Premium or Pro subscription required to view this content.'
      });
    }

    const premiumContent = await Content.find({ contentType: 'premium' });

    // pro user business logic: additional benefits / discounts
    const responseData = {
      message: 'Premium content fetched successfully',
      plan: user.subscriptionPlan,
      count: premiumContent.length,
      data: premiumContent
    };

    if (user.subscriptionPlan === 'pro') {
      responseData.proPerks = {
        discountPercentage: 20,
        description: 'Pro members receive a 20% discount on all purchases!'
      };
    }

    res.status(200).json(responseData);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching premium content', error: error.message });
  }
});

// POST /content - admin only: create new content
router.post('/', authMiddleware, roleMiddleware(['admin']), async (req, res) => {
  try {
    const { title, description, contentType, price } = req.body;

    if (!title || !description) {
      return res.status(400).json({ message: 'Title and description are required' });
    }

    const validContentType =
      contentType && ['free', 'premium'].includes(contentType.toLowerCase())
        ? contentType.toLowerCase()
        : 'free';

    const newContent = new Content({
      title,
      description,
      contentType: validContentType,
      price: price ? Number(price) : (validContentType === 'premium' ? 100 : 0),
      createdBy: req.user._id
    });

    await newContent.save();

    res.status(201).json({
      message: 'Content created successfully',
      content: newContent
    });
  } catch (error) {
    res.status(500).json({ message: 'Error creating content', error: error.message });
  }
});

// PUT /content/:id - admin only: update content
router.put('/:id', authMiddleware, roleMiddleware(['admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, contentType, price } = req.body;

    const updatedContent = await Content.findByIdAndUpdate(
      id,
      {
        ...(title && { title }),
        ...(description && { description }),
        ...(contentType && { contentType }),
        ...(price !== undefined && { price: Number(price) })
      },
      { new: true }
    );

    if (!updatedContent) {
      return res.status(404).json({ message: 'Content item not found' });
    }

    res.status(200).json({
      message: 'Content updated successfully',
      content: updatedContent
    });
  } catch (error) {
    res.status(500).json({ message: 'Error updating content', error: error.message });
  }
});

// DELETE /content/:id - admin only: delete content
router.delete('/:id', authMiddleware, roleMiddleware(['admin']), async (req, res) => {
  try {
    const { id } = req.params;

    const content = await Content.findByIdAndDelete(id);
    if (!content) {
      return res.status(404).json({ message: 'Content item not found' });
    }

    res.status(200).json({
      message: 'Content deleted successfully',
      deletedId: id
    });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting content', error: error.message });
  }
});

// POST /content/purchase/:id - business logic: pro users get 20% discount on purchase
router.post('/purchase/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user;

    const content = await Content.findById(id);
    if (!content) {
      return res.status(404).json({ message: 'Content item not found' });
    }

    const basePrice = content.price || 100;
    let discount = 0;
    let finalPrice = basePrice;

    // pro user discount logic
    if (user.subscriptionPlan === 'pro') {
      discount = 20; // 20% discount
      finalPrice = basePrice * 0.8;
    }

    res.status(200).json({
      message: 'Purchase processed successfully',
      item: content.title,
      basePrice,
      userPlan: user.subscriptionPlan,
      discountPercentage: discount,
      amountToPay: finalPrice
    });
  } catch (error) {
    res.status(500).json({ message: 'Error processing purchase', error: error.message });
  }
});

module.exports = router;
