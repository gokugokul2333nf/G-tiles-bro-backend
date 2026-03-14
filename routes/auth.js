const express = require('express');
const { body, validationResult } = require('express-validator');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { protect } = require('../middleware/auth');

const router = express.Router();

// Helper: generate JWT
const generateToken = (id) => {
  if (!process.env.JWT_SECRET) {
    console.error('CRITICAL: JWT_SECRET is not defined in environment variables');
    throw new Error('JWT_SECRET is missing');
  }
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || '7d',
  });
};

// Helper: send token response
const sendTokenResponse = (user, statusCode, res, message) => {
  const token = generateToken(user._id);
  res.status(statusCode).json({
    success: true,
    message,
    token,
    user,
  });
};

// @route   POST /api/auth/register
// @desc    Register a new user
// @access  Public
router.post(
  '/register',
  [
    body('name')
      .trim()
      .isLength({ min: 2 })
      .withMessage('Name must be at least 2 characters'),
    body('email')
      .isEmail()
      .normalizeEmail()
      .withMessage('Please provide a valid email'),
    body('password')
      .isLength({ min: 6 })
      .withMessage('Password must be at least 6 characters'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: errors.array()[0].msg,
        errors: errors.array(),
      });
    }

    const { name, email, password } = req.body;

    try {
      // Check if user already exists
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: 'An account with this email already exists.',
        });
      }

      // Create user
      const user = await User.create({ name, email, password });
      user.lastLogin = new Date();
      await user.save({ validateBeforeSave: false });

      sendTokenResponse(user, 201, res, 'Account created successfully!');
    } catch (err) {
      console.error('Register error details:', {
        message: err.message,
        stack: err.stack,
        env: {
          hasJwtSecret: !!process.env.JWT_SECRET,
          nodeEnv: process.env.NODE_ENV
        }
      });
      res.status(500).json({
        success: false,
        message: `Server Error: ${err.message}`,
        debug: {
          msg: err.message,
          hasJwtSecret: !!process.env.JWT_SECRET
        }
      });
    }
  }
);

// @route   POST /api/auth/login
// @desc    Login user and return JWT
// @access  Public
router.post(
  '/login',
  [
    body('email').isEmail().normalizeEmail().withMessage('Please provide a valid email'),
    body('password').notEmpty().withMessage('Password is required'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: errors.array()[0].msg,
      });
    }

    const { email, password } = req.body;

    try {
      // Find user with password
      const user = await User.findOne({ email }).select('+password');
      if (!user) {
        return res.status(401).json({
          success: false,
          message: 'Invalid email or password.',
        });
      }

      // Check password
      const isMatch = await user.comparePassword(password);
      if (!isMatch) {
        return res.status(401).json({
          success: false,
          message: 'Invalid email or password.',
        });
      }

      // Update last login
      user.lastLogin = new Date();
      await user.save({ validateBeforeSave: false });

      // Remove password from output
      user.password = undefined;

      sendTokenResponse(user, 200, res, 'Login successful!');
    } catch (err) {
      console.error('Login error details:', {
        message: err.message,
        stack: err.stack,
        env: {
          hasJwtSecret: !!process.env.JWT_SECRET,
          nodeEnv: process.env.NODE_ENV
        }
      });
      res.status(500).json({
        success: false,
        message: `Server Error: ${err.message}`,
        debug: {
          msg: err.message,
          hasJwtSecret: !!process.env.JWT_SECRET
        }
      });
    }
  }
);

// @route   GET /api/auth/me
// @desc    Get current logged-in user
// @access  Private
router.get('/me', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    res.status(200).json({
      success: true,
      user,
    });
  } catch (err) {
    console.error('Get me error:', err);
    res.status(500).json({
      success: false,
      message: 'Server error. Please try again later.',
    });
  }
});

// @route   GET /api/auth/dashboard
// @desc    Get dashboard data for authenticated user
// @access  Private
router.get('/dashboard', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    res.status(200).json({
      success: true,
      user,
      stats: {
        totalProjects: 12,
        activeTasks: 5,
        completedTasks: 47,
        teamMembers: 8,
        balance: user.balance || 0,
      },
      recentActivity: [
        { id: 1, action: 'Logged in successfully', time: new Date(), type: 'auth' },
        { id: 2, action: 'Profile updated', time: new Date(Date.now() - 3600000), type: 'profile' },
        { id: 3, action: 'New project created', time: new Date(Date.now() - 7200000), type: 'project' },
        { id: 4, action: 'Task completed', time: new Date(Date.now() - 86400000), type: 'task' },
      ],
    });
  } catch (err) {
    console.error('Dashboard error:', err);
    res.status(500).json({
      success: false,
      message: 'Server error. Please try again later.',
    });
  }
});

// @route   POST /api/auth/balance/update
// @desc    Update user balance (demo purpose)
// @access  Private
router.post(
  '/balance/update',
  protect,
  [body('amount').isNumeric().withMessage('Amount must be a number')],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: errors.array()[0].msg });
    }

    try {
      const user = await User.findById(req.user._id);
      user.balance = (user.balance || 0) + Number(req.body.amount);
      await user.save();

      res.status(200).json({
        success: true,
        message: 'Balance updated successfully',
        balance: user.balance,
      });
    } catch (err) {
      console.error('Balance update error:', err);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  }
);

// @route   PATCH /api/auth/users/:id/role
// @desc    Change a user's role (admin only)
// @access  Private/Admin
router.patch(
  '/users/:id/role',
  protect,
  async (req, res) => {
    // only admins can change roles
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const { role } = req.body;
    if (!['user', 'marketing', 'admin'].includes(role)) {
      return res.status(400).json({ success: false, message: 'Invalid role' });
    }

    try {
      const user = await User.findById(req.params.id);
      if (!user) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }
      user.role = role;
      await user.save();
      res.status(200).json({ success: true, user });
    } catch (err) {
      console.error('Role update error:', err);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  }
);

// @route   GET /api/auth/users
// @desc    Get list of all users (admin only)
// @access  Private/Admin
router.get('/users', protect, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Forbidden' });
  }
  try {
    const users = await User.find().select('-password');
    res.status(200).json({ success: true, users });
  } catch (err) {
    console.error('Users fetch error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route   DELETE /api/auth/users/:id
// @desc    Delete a user (admin only)
// @access  Private/Admin
router.delete('/users/:id', protect, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Forbidden' });
  }
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // prevent admin from deleting themselves
    if (user._id.toString() === req.user._id.toString()) {
      return res.status(400).json({ success: false, message: 'Cannot delete yourself' });
    }

    await user.deleteOne();
    res.status(200).json({ success: true, message: 'User removed' });
  } catch (err) {
    console.error('User delete error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route   PUT /api/auth/location
// @desc    Update current user's location
// @access  Private
router.put(
  '/location',
  protect,
  [
    body('latitude').isNumeric().withMessage('Latitude must be a number'),
    body('longitude').isNumeric().withMessage('Longitude must be a number'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: errors.array()[0].msg });
    }

    try {
      const user = await User.findById(req.user._id);
      user.location = {
        latitude: req.body.latitude,
        longitude: req.body.longitude,
        lastLocationUpdate: new Date(),
      };
      await user.save({ validateBeforeSave: false });

      res.status(200).json({
        success: true,
        message: 'Location updated successfully',
        location: user.location,
      });
    } catch (err) {
      console.error('Location update error:', err);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  }
);

// @route   GET /api/auth/marketing-locations
// @desc    Get locations of all marketing staff (admin only)
// @access  Private/Admin
router.get('/marketing-locations', protect, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Forbidden' });
  }

  try {
    const marketingStaff = await User.find({ role: 'marketing' }).select('name email location');
    res.status(200).json({
      success: true,
      staff: marketingStaff,
    });
  } catch (err) {
    console.error('Marketing locations fetch error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
