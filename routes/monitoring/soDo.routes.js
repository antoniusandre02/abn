// File: routes/monitorings/soDo.routes.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { checkRole, verifyToken } = require('../auth/auth.middleware');
const soDoController = require('./soDo.controller');

// Konfigurasi Multer untuk upload file CSV
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});
const upload = multer({ storage });


// GET Pages
router.get('/soDo', verifyToken, checkRole([1, 8, 10, 11, 12, 14]), soDoController.getListPage);
router.get('/edit/:id', verifyToken, checkRole([1, 8, 10, 11, 12]), soDoController.getEditPage);
router.get('/view/:id', verifyToken, checkRole([1, 8, 10, 11, 12, 14]), soDoController.getViewPage);
router.get('/upload', verifyToken, checkRole([1]), soDoController.getUploadPage);
router.get('/detail/:id', verifyToken, checkRole([1, 8]), soDoController.getDetailMonitoring);
router.get('/historyFinance', verifyToken, checkRole([1, 8]), soDoController.getHistoryCheck);
router.get('/soDo/export-csv', checkRole([1, 8]), soDoController.exportCSV);

// POST Actions
router.post('/create', verifyToken, checkRole([1, 8, 10, 11, 12]), soDoController.createSO);
router.post('/update/:id_monitoring_data', verifyToken, checkRole([1, 8, 10, 11, 12]), soDoController.updateSO);
router.post('/upload', verifyToken, checkRole([1]), upload.single('csvFile'), soDoController.uploadSO);
router.post('/invoice-export/:id', verifyToken, checkRole([1, 8]), soDoController.updateInvoicingDate);
router.post('/cancelDelete/:id_monitoring_data', verifyToken, checkRole([1, 8, 10, 11, 12]), soDoController.cancelDelete);

module.exports = router;
