// routes/assets/inventory.routes.js
const express = require('express');
const router = express.Router();

// Import sub-route
const assetRoutes = require('./asset.routes');
const karyawanRoutes = require('./karyawan.routes');
const pinjamAssetRoutes = require('./pinjamAsset.routes');
const pengajuanMemo = require('./pengajuanMemo.routes');

// Gabungkan semua route ke router utama ini
router.use('/', assetRoutes);
router.use('/', karyawanRoutes);
router.use('/', pinjamAssetRoutes);
router.use('/', pengajuanMemo);

module.exports = router;
