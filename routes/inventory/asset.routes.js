// routes/assets/asset.routes.js
const express = require('express');
const router = express.Router();
const assetController = require('../inventory/asset.controller');
const { checkRole, verifyToken } = require('../auth/auth.middleware');

// GET pages
router.get('/asset', checkRole([1, 13]), assetController.getAssetListPage);
router.get('/assetEdit/:id', checkRole([1, 13]), assetController.getAssetEditPage);
router.get('/barcodeAsset/:kode_asset', assetController.generateBarcodePDF);

// POST actions
router.post('/createAsset', assetController.createAsset);
router.post('/updateAsset/:id', assetController.updateAsset);

module.exports = router;
