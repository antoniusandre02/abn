// routes/assets/inventory.routes.js
const express = require('express');
const router = express.Router();

// Import sub-route
const ewarrantyRoutes = require('./ewarranty.routes');

// Gabungkan semua route ke router utama ini
router.use('/ewarranty/', ewarrantyRoutes);

module.exports = router;
