const express = require('express');
const { body, validationResult } = require('express-validator');
const Customer = require('../models/Customer');
const { protect, authorizeRoles } = require('../middleware/auth');

const router = express.Router();

// @route POST /api/customers
// @desc create a customer record (marketing or admin only)
router.post(
  '/',
  protect,
  authorizeRoles('marketing', 'admin'),
  [
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('phone').trim().notEmpty().withMessage('Phone number is required'),
    body('visitedAt').isISO8601().withMessage('Valid visit date is required'),
    body('reason')
      .isIn(['enquired', 'purchased'])
      .withMessage('Reason must be enquired or purchased'),
    body('paymentStatus')
      .optional()
      .isIn(['pending', 'completed'])
      .withMessage('Payment status must be pending or completed'),
    body('amount').optional().isNumeric().withMessage('Amount must be a number'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    try {
      const data = {
        ...req.body,
        enteredBy: req.user._id,
      };
      const customer = await Customer.create(data);
      res.status(201).json({ success: true, customer });
    } catch (err) {
      console.error('Customer creation error:', err);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  }
);

// @route GET /api/customers
// @desc list all customers (marketing and admin)
router.get('/', protect, authorizeRoles('marketing', 'admin'), async (req, res) => {
  try {
    let query = {};
    
    // if the user is marketing, only show their own records
    if (req.user.role === 'marketing') {
      query.enteredBy = req.user._id;
    }
    
    // admins see all records, no filtering needed in query
    
    const customers = await Customer.find(query)
      .populate('enteredBy', 'name email role')
      .sort({ visitedAt: -1 });
    res.status(200).json({ success: true, customers });
  } catch (err) {
    console.error('Customer list error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route GET /api/customers/stats
// @desc get revenue statistics (marketing and admin)
router.get('/stats', protect, authorizeRoles('marketing', 'admin'), async (req, res) => {
  try {
    const { month, year } = req.query;
    const now = new Date();
    
    // Default to current month/year if not provided
    const targetMonth = month ? parseInt(month) - 1 : now.getMonth();
    const targetYear = year ? parseInt(year) : now.getFullYear();

    // Calculate ranges based on target month in UTC
    const startOfMonth = new Date(Date.UTC(targetYear, targetMonth, 1, 0, 0, 0, 0));
    const endOfMonth = new Date(Date.UTC(targetYear, targetMonth + 1, 0, 23, 59, 59, 999));
    
    // For "Annual Trend", look at the entire year in UTC
    const startOfYear = new Date(Date.UTC(targetYear, 0, 1, 0, 0, 0, 0));
    const endOfYear = new Date(Date.UTC(targetYear, 11, 31, 23, 59, 59, 999));
    
    // Current date for Today/Week comparisons in UTC
    const nowUTC = new Date();
    const startOfToday = new Date(Date.UTC(nowUTC.getUTCFullYear(), nowUTC.getUTCMonth(), nowUTC.getUTCDate(), 0, 0, 0, 0));
    const startOfTomorrow = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000);
    const startOfWeek = new Date(startOfToday.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Build base match stage
    let matchStage = {};
    if (req.user.role === 'marketing') {
      matchStage.enteredBy = req.user._id;
    }

    const stats = await Customer.aggregate([
      {
        $facet: {
          today: [
            { $match: { ...matchStage, visitedAt: { $gte: startOfToday, $lt: startOfTomorrow }, paymentStatus: 'completed' } },
            { $group: { _id: null, total: { $sum: '$amount' } } }
          ],
          week: [
            { $match: { ...matchStage, visitedAt: { $gte: startOfWeek }, paymentStatus: 'completed' } },
            { $group: { _id: null, total: { $sum: '$amount' } } }
          ],
          month: [
            { $match: { ...matchStage, visitedAt: { $gte: startOfMonth, $lt: endOfMonth }, paymentStatus: 'completed' } },
            { $group: { _id: null, total: { $sum: '$amount' } } }
          ],
          pendingMonth: [
            { $match: { ...matchStage, visitedAt: { $gte: startOfMonth, $lt: endOfMonth }, paymentStatus: 'pending' } },
            { $group: { _id: null, total: { $sum: '$amount' } } }
          ],
          paidCountMonth: [
            { $match: { ...matchStage, visitedAt: { $gte: startOfMonth, $lt: endOfMonth }, paymentStatus: 'completed' } },
            { $count: 'total' }
          ],
          totalLeadCountMonth: [
            { $match: { ...matchStage, visitedAt: { $gte: startOfMonth, $lt: endOfMonth } } },
            { $count: 'total' }
          ],
          trend: [
            { $match: { ...matchStage, visitedAt: { $gte: startOfMonth, $lt: endOfMonth }, paymentStatus: 'completed' } },
            {
              $group: {
                _id: { $dateToString: { format: '%Y-%m-%d', date: '$visitedAt' } },
                amount: { $sum: '$amount' }
              }
            },
            { $sort: { _id: 1 } }
          ],
          calendar: [
             { $match: { ...matchStage, visitedAt: { $gte: startOfMonth, $lt: endOfMonth }, paymentStatus: 'completed' } },
             {
               $group: {
                 _id: { $dateToString: { format: '%Y-%m-%d', date: '$visitedAt' } },
                 count: { $sum: 1 }
               }
             }
          ],
          annualTrend: [
            { $match: { ...matchStage, visitedAt: { $gte: startOfYear, $lt: endOfYear }, paymentStatus: 'completed' } },
            {
              $group: {
                _id: { $month: '$visitedAt' },
                amount: { $sum: '$amount' }
              }
            },
            { $sort: { _id: 1 } }
          ]
        }
      }
    ]);

    const result = {
      today: stats[0].today[0]?.total || 0,
      week: stats[0].week[0]?.total || 0,
      month: stats[0].month[0]?.total || 0,
      pendingMonth: stats[0].pendingMonth[0]?.total || 0,
      paidCountMonth: stats[0].paidCountMonth[0]?.total || 0,
      totalLeadCountMonth: stats[0].totalLeadCountMonth[0]?.total || 0,
      trend: stats[0].trend,
      calendar: stats[0].calendar,
      annualTrend: stats[0].annualTrend
    };

    res.status(200).json({ success: true, stats: result });
  } catch (err) {
    console.error('Stats calculation error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route GET /api/customers/stats/daily
// @desc get customers and revenue for a specific day (marketing and admin)
router.get('/stats/daily', protect, authorizeRoles('marketing', 'admin'), async (req, res) => {
  try {
    const { date } = req.query;
    if (!date) return res.status(400).json({ success: false, message: 'Date is required' });

    // Parse as UTC midnight
    const [year, month, day] = date.split('-').map(Number);
    const startDate = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
    const endDate = new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));

    // Base query
    let query = {
      visitedAt: { $gte: startDate, $lt: endDate }
    };

    // Filter by user if marketing
    if (req.user.role === 'marketing') {
      query.enteredBy = req.user._id;
    }

    // Find customers for the day for drilldown
    const customers = await Customer.find(query).populate('enteredBy', 'name');

    // Revenue = Only completed payments
    const revenue = customers
      .filter(c => c.paymentStatus === 'completed')
      .reduce((sum, c) => sum + (c.amount || 0), 0);

    // Total Sum = All payments (completed + pending)
    const totalSum = customers.reduce((sum, c) => sum + (c.amount || 0), 0);

    // Pending Amount = Total Sum - Revenue
    const pendingAmount = totalSum - revenue;

    res.status(200).json({ success: true, date, revenue, totalSum, pendingAmount, customers });
  } catch (err) {
    console.error('Daily stats error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route GET /api/customers/team-stats
// @desc get aggregated stats for all marketing users (admin only)
router.get('/team-stats', protect, authorizeRoles('admin'), async (req, res) => {
  try {
    const stats = await Customer.aggregate([
      {
        $group: {
          _id: '$enteredBy',
          totalPaid: {
            $sum: { $cond: [{ $eq: ['$paymentStatus', 'completed'] }, '$amount', 0] }
          },
          totalPending: {
            $sum: { $cond: [{ $eq: ['$paymentStatus', 'pending'] }, '$amount', 0] }
          },
          leadCount: { $sum: 1 },
          paidCount: {
            $sum: { $cond: [{ $eq: ['$paymentStatus', 'completed'] }, 1, 0] }
          }
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'userInfo'
        }
      },
      { $unwind: '$userInfo' },
      {
        $project: {
          _id: 1,
          totalPaid: 1,
          totalPending: 1,
          leadCount: 1,
          paidCount: 1,
          name: '$userInfo.name',
          email: '$userInfo.email'
        }
      },
      { $sort: { totalPaid: -1 } }
    ]);

    res.status(200).json({ success: true, stats });
  } catch (err) {
    console.error('Team stats error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route DELETE /api/customers/mock
// @desc clear mock customer records (admin only)
router.delete('/mock', protect, authorizeRoles('admin'), async (req, res) => {
  try {
    const result = await Customer.deleteMany({
      $or: [
        { name: { $regex: /^Customer \d+-\d+$/i } },
        { name: 'Gokulraj' }
      ]
    });
    res.status(200).json({ success: true, message: `Cleared ${result.deletedCount} mock records.` });
  } catch (err) {
    console.error('Clear mock error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route GET /api/customers/:id
// @desc get single customer
router.get('/:id', protect, authorizeRoles('marketing', 'admin'), async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id).populate('enteredBy', 'name email role');
    if (!customer) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }
    res.status(200).json({ success: true, customer });
  } catch (err) {
    console.error('Customer fetch error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route PUT /api/customers/:id
// @desc update a customer (only creator or admin)
router.put(
  '/:id',
  protect,
  authorizeRoles('marketing', 'admin'),
  [
    body('name').optional().trim().notEmpty().withMessage('Name is required'),
    body('phone').optional().trim().notEmpty().withMessage('Phone number is required'),
    body('visitedAt').optional().isISO8601().withMessage('Valid visit date is required'),
    body('reason')
      .optional()
      .isIn(['enquired', 'purchased'])
      .withMessage('Reason must be enquired or purchased'),
    body('paymentStatus')
      .optional()
      .isIn(['pending', 'completed'])
      .withMessage('Payment status must be pending or completed'),
    body('amount').optional().isNumeric().withMessage('Amount must be a number'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    try {
      const customer = await Customer.findById(req.params.id);
      if (!customer) {
        return res.status(404).json({ success: false, message: 'Customer not found' });
      }

      // only the user who entered the customer or an admin can modify
      const isCreator = customer.enteredBy.toString() === req.user._id.toString();
      const isAdmin = req.user.role === 'admin';

      console.log('--- UPDATE PERMISSION CHECK ---');
      console.log('Creator ID:', customer.enteredBy.toString());
      console.log('User ID:', req.user._id.toString());
      console.log('User Role:', req.user.role);
      console.log('isCreator:', isCreator);
      console.log('isAdmin:', isAdmin);

      if (!isCreator && !isAdmin) {
        return res.status(403).json({ success: false, message: 'Forbidden' });
      }

      Object.assign(customer, req.body);
      await customer.save();
      res.status(200).json({ success: true, customer });
    } catch (err) {
      console.error('Customer update error:', err);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  }
);

// @route DELETE /api/customers/:id
// @desc delete a customer (only creator or admin)
router.delete('/:id', protect, authorizeRoles('marketing', 'admin'), async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id);
    if (!customer) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    // Check if user is the creator or an admin
    const creatorId = customer.enteredBy ? customer.enteredBy.toString() : null;
    const userId = req.user._id ? req.user._id.toString() : null;
    const isCreator = creatorId === userId;
    const isAdmin = req.user.role === 'admin';

    if (isCreator || isAdmin) {
      await Customer.findByIdAndDelete(req.params.id);
      return res.status(200).json({ success: true, message: 'Customer removed' });
    } else {
      return res.status(403).json({ success: false, message: 'Forbidden: You can only delete your own records' });
    }
  } catch (err) {
    console.error('Customer delete error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// (Moved /mock up)
module.exports = router;
