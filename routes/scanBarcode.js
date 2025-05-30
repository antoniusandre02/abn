const express = require('express');
const router = express.Router();
const pool = require('../db');
const moment = require('moment');
const checkRole = require('../middlewares/roleMiddleware');

const statusRoleMap = {
  'Picked': [1, 2, 3, 12],
  'Packed': [1, 4, 5, 12],
  'Shipped': [1, 6, 7, 12]
};

router.post('/scanBarcode', checkRole([1, 2, 3, 4, 5, 6, 7, 12]), async (req, res) => {
  const { barcode_do } = req.body;
  const userSession = req.session.user;
  const user_id = userSession?.user_id;
  const name = userSession?.name;
  const role_name = userSession?.role_name;
  const user_role = userSession?.role;
  if (!barcode_do || !user_id || !user_role) {
    return res.render('scanBarcode', { message: 'Barcode atau user tidak valid.' });
  }

  try {
    const result = await pool.query(
      'SELECT * FROM monitoring_data WHERE delivery_order_number = $1',
      [barcode_do]
    );

    if (result.rows.length === 0) {
      return res.render('scanBarcode', { message: 'Data dengan barcode tersebut tidak ditemukan.' });
    }

    const data = result.rows[0];
    const now = moment().format('YYYY-MM-DD HH:mm:ss');
    const currentStatus = data.status || 'Draft';

    // Tentukan status berikutnya
    let nextStatus = '';
    if (currentStatus === 'Draft') nextStatus = 'Picked';
    else if (currentStatus === 'Picked') nextStatus = 'Packed';
    else if (currentStatus === 'Packed') nextStatus = 'Shipped';
    else return res.render('scanBarcode', { message: 'Status sudah lengkap. Tidak perlu scan lagi.' });

    // Cegah duplikasi scan jika status tersebut sudah diisi
    if (nextStatus === 'Picked' && data.picked_date) {
      return res.render('scanBarcode', { message: 'Sudah di-scan sebagai Picked.' });
    }
    if (nextStatus === 'Packed' && data.packed_date) {
      return res.render('scanBarcode', { message: 'Sudah di-scan sebagai Packed.' });
    }
    if (nextStatus === 'Shipped' && data.shipped_date) {
      return res.render('scanBarcode', { message: 'Sudah di-scan sebagai Shipped.' });
    }

    // Cek apakah role user boleh melakukan update ke status berikutnya
    const allowedRoles = statusRoleMap[nextStatus];
    if (!allowedRoles.includes(user_role)) {
      return res.render('scanBarcode', {
        message: `Kamu tidak memiliki akses untuk update status "${nextStatus}".`
      });
    }

    // Tentukan query update
    let updateQuery = '';
    let updateMessage = '';

    if (nextStatus === 'Picked') {
      updateQuery = `
        UPDATE monitoring_data 
        SET status = 'Picked', picked_date = $1, picked_by = $2, update_at = now()
        WHERE delivery_order_number = $3
      `;
      req.io.emit('dataUpdateTrigger');
      updateMessage = 'Status berhasil diupdate: Picked';
    } else if (nextStatus === 'Packed') {
      updateQuery = `
        UPDATE monitoring_data 
        SET status = 'Packed', packed_date = $1, packed_by = $2, update_at = now()
        WHERE delivery_order_number = $3
      `;
      req.io.emit('dataUpdateTrigger');
      updateMessage = 'Status berhasil diupdate: Packed';
    } else if (nextStatus === 'Shipped') {
      updateQuery = `
        UPDATE monitoring_data 
        SET status = 'Shipped', shipped_date = $1, shipped_by = $2, is_done = true, update_at = now()
        WHERE delivery_order_number = $3
      `;
      req.io.emit('dataUpdateTrigger');
      updateMessage = 'Status berhasil diupdate: Shipped';
    }

    await pool.query(updateQuery, [now, user_id, barcode_do]);

    await pool.query(
      `INSERT INTO log_monitoring_scan 
        (user_id, name, role_name, delivery_order_number_scanned, status_scanned, scanned_at)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [user_id, name, role_name, barcode_do, nextStatus]
    );
    res.render('scanBarcode', { message: updateMessage });
    
  } catch (err) {
    console.error('Gagal update:', err);
    res.render('scanBarcode', { message: 'Terjadi kesalahan saat memproses scan.' });
  }
});

module.exports = router;
