const express = require('express');
const router = express.Router();
const { checkRole, verifyToken } = require('../auth/auth.middleware');
const scanBarcodeController = require('./scanBarcode.controller');

router.use(verifyToken);

router.get('/scanBarcode', checkRole([1, 2, 3, 4, 5, 6, 7, 12, 16]), scanBarcodeController.getScanBarcodePage);
router.post('/scanBarcode', checkRole([1, 2, 3, 4, 5, 6, 7, 12, 16]), scanBarcodeController.handleScanBarcode);

module.exports = router;
