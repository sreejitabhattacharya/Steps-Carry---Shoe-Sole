const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Order = require('../models/Order');
const Product = require('../models/Product');
const Contact = require('../models/Contact');
const { protect, adminOnly } = require('../middleware/auth');

// All admin routes require login + admin role
router.use(protect, adminOnly);

// ─────────────────────────────────────────────
// GET /api/admin/stats  — Dashboard numbers
// ─────────────────────────────────────────────
router.get('/stats', async (req, res) => {
  try {
    const [totalUsers, totalOrders, newMessages, rawOrders] = await Promise.all([
      User.countDocuments({ isAdmin: { $ne: true } }),
      Order.countDocuments(),
      Contact.countDocuments({ status: 'New' }),
      Order.find()
        .populate({ path: 'user', select: 'name email phone avatar', options: { strictPopulate: false } })
        .populate({ path: 'items.product', select: 'name price image', options: { strictPopulate: false } })
        .sort({ createdAt: -1 })
        .limit(10),
    ]);
    const orders = rawOrders.map(o => {
      const obj = o.toObject();
      if (!obj.user) obj.user = { name: 'Deleted User', email: '—' };
      return obj;
    });

    // Revenue = sum of non-cancelled orders
    const revenueData = await Order.aggregate([
      { $match: { status: { $ne: 'Cancelled' } } },
      { $group: { _id: null, total: { $sum: '$totalAmount' } } },
    ]);
    const totalRevenue = revenueData[0]?.total || 0;

    // Cancelled count
    const cancelledOrders = await Order.countDocuments({ status: 'Cancelled' });
    const deliveredOrders = await Order.countDocuments({ status: 'Delivered' });

    // Monthly revenue for chart (current year)
    const year = new Date().getFullYear();
    const monthlyData = await Order.aggregate([
      { $match: { status: { $ne: 'Cancelled' }, createdAt: { $gte: new Date(`${year}-01-01`) } } },
      { $group: { _id: { $month: '$createdAt' }, revenue: { $sum: '$totalAmount' } } },
      { $sort: { '_id': 1 } },
    ]);
    const monthly = Array(12).fill(0);
    monthlyData.forEach(d => { monthly[d._id - 1] = d.revenue; });

    res.json({
      success: true,
      stats: {
        totalUsers,
        totalOrders,
        newMessages,
        totalRevenue,
        cancelledOrders,
        deliveredOrders,
        recentOrders: orders,
        monthlyRevenue: monthly,
      },
    });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ─────────────────────────────────────────────
// USERS
// ─────────────────────────────────────────────
// GET /api/admin/users
router.get('/users', async (req, res) => {
  try {
    const users = await User.find({ isAdmin: { $ne: true } }).select('-password').sort({ createdAt: -1 });
    res.json({ success: true, users });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// DELETE /api/admin/users/:id
router.delete('/users/:id', async (req, res) => {
  try {
    await User.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'User deleted' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ─────────────────────────────────────────────
// ORDERS
// ─────────────────────────────────────────────
// GET /api/admin/orders
router.get('/orders', async (req, res) => {
  try {
    const orders = await Order.find()
      .populate({ path: 'user', select: 'name email phone avatar', options: { strictPopulate: false } })
      .populate({ path: 'items.product', select: 'name price image', options: { strictPopulate: false } })
      .sort({ createdAt: -1 });
    // If user was deleted or is null, set a placeholder so frontend doesn't break
    const safeOrders = orders.map(o => {
      const obj = o.toObject();
      if (!obj.user) obj.user = { name: 'Deleted User', email: '—', phone: '—' };
      return obj;
    });
    res.json({ success: true, orders: safeOrders });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// PUT /api/admin/orders/:id/status
router.put('/orders/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    const allowed = ['Placed', 'Confirmed', 'Shipped', 'Out for Delivery', 'Delivered', 'Cancelled'];
    if (!allowed.includes(status))
      return res.status(400).json({ success: false, message: 'Invalid status' });

    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    order.status = status;
    if (status === 'Delivered') order.deliveredAt = new Date();
    await order.save();

    res.json({ success: true, order });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ─────────────────────────────────────────────
// CONTACTS / MESSAGES
// ─────────────────────────────────────────────
// GET /api/admin/contacts
router.get('/contacts', async (req, res) => {
  try {
    const messages = await Contact.find().sort({ createdAt: -1 });
    res.json({ success: true, messages });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// PUT /api/admin/contacts/:id  — mark read/replied
router.put('/contacts/:id', async (req, res) => {
  try {
    const contact = await Contact.findByIdAndUpdate(req.params.id, { status: req.body.status }, { new: true });
    if (!contact) return res.status(404).json({ success: false, message: 'Message not found' });
    res.json({ success: true, contact });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// DELETE /api/admin/contacts/:id
router.delete('/contacts/:id', async (req, res) => {
  try {
    await Contact.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Message deleted' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ─────────────────────────────────────────────
// PRODUCTS (admin full control)
// ─────────────────────────────────────────────
// GET /api/admin/products
router.get('/products', async (req, res) => {
  try {
    const products = await Product.find().sort({ createdAt: -1 });
    res.json({ success: true, products });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// POST /api/admin/products
router.post('/products', async (req, res) => {
  try {
    const product = await Product.create(req.body);
    res.status(201).json({ success: true, product });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// PUT /api/admin/products/:id
router.put('/products/:id', async (req, res) => {
  try {
    const product = await Product.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
    res.json({ success: true, product });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// DELETE /api/admin/products/:id
router.delete('/products/:id', async (req, res) => {
  try {
    await Product.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Product deleted' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});


// PUT /api/admin/orders/:id/cancel  — admin cancels any order
router.put('/orders/:id/cancel', async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    if (['Delivered', 'Cancelled'].includes(order.status))
      return res.status(400).json({ success: false, message: `Cannot cancel a ${order.status} order` });
    order.status = 'Cancelled';
    order.cancelReason = req.body.reason || 'Cancelled by admin';
    await order.save();
    res.json({ success: true, order });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

module.exports = router;
