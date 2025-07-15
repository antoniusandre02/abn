// routes/assets/karyawan.routes.js
const express = require('express');
const router = express.Router();
const karyawanController = require('../inventory/karyawan.controller');
const { checkRole, verifyToken } = require('../auth/auth.middleware');

// GET & LIST
router.get('/karyawan', checkRole([1, 13]), karyawanController.getKaryawan);
router.get('/karyawanEdit/:id', checkRole([1, 13]), karyawanController.getKaryawanEdit);

// CREATE & UPDATE
router.post('/createKaryawan', karyawanController.createKaryawan);
router.post('/updateKaryawan/:id', karyawanController.updateKaryawan);

module.exports = router;