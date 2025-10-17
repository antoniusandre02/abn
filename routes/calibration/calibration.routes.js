// routes/assets/inventory.routes.js
const express = require('express');
const router = express.Router();

// Import sub-route
const ewarrantyRoutes = require('./ewarranty.routes');
const pipetteCalibration = require('./pipetteCalibration.routes');

// Gabungkan semua route ke router utama ini
router.use('/ewarranty/', ewarrantyRoutes);
router.use('/pipette/', pipetteCalibration);

module.exports = router;
