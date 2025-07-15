// routes/assets/assets.routes.js
const express = require('express');
const router = express.Router();
const scanBarcodeRoutes = require('./scanBarcode.routes');
const soDoRoutes = require('./soDo.routes');

router.use('/', soDoRoutes); // <== ini penting
router.use('/', scanBarcodeRoutes);

module.exports = router;
