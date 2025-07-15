const express = require('express');
const router = express.Router();
const controller = require('../inventory/pinjamAsset.controller');
const { checkRole, verifyToken } = require('../auth/auth.middleware');

// List, Form
router.get('/pinjamAsset', checkRole([1, 13]), controller.getPinjamAssetList);
router.get('/pinjamAssetEdit/:id', checkRole([1, 13]), controller.getPinjamAssetEdit);

// Create & Update
router.post('/pinjamAssetCreate', controller.createPinjamAsset);
router.post('/updatePinjamAsset/:id', controller.updatePinjamAsset);

// Get JSON detail
router.get('/karyawan-info/:id', controller.getKaryawanInfo);

// Print Form
router.get('/printFormPeminjaman/:id', controller.printFormPeminjaman);

module.exports = router;
