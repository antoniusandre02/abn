const express = require('express');
const router = express.Router();
const pool = require('../db');
const { verifyToken, checkRole, verifySessionToken } = require('./auth/auth.middleware');

router.get('/debug-session', (req, res) => {
  console.log('Session:', req.session);
  console.log('Flash:', req.flash);
  res.send('Cek session di terminal');
});

// ✅ Middleware proteksi (apply ke route yang memang butuh proteksi login dan session)
const protectedPaths = [
  '/dashboard',
  '/dashboardData',
  '/scanBarcode',
  '/soDo',
  '/soDoEdit',
  '/uploadSODO',
  '/create',
  '/update/:id_monitoring_data',
  '/upload',
  '/karyawan',
  '/asset',
  '/pinjamAsset',
  '/pinjamAssetEdit/:id'
];
router.use(protectedPaths, verifyToken, verifySessionToken);

// ✅ Middleware global agar `user` bisa dipakai di semua EJS
router.use((req, res, next) => {
  res.locals.user = req.user;
  next();
});

// =================== Auth & Root =====================
router.get('/', (req, res) => res.render('login'));
router.get('/login', (req, res) => res.render('login'));
router.get('/register', (req, res) => res.render('register'));

// =================== Dashboard View =====================
router.get('/dashboard', async (req, res) => {
  const limit = 10;
  const page = parseInt(req.query.page) || 1;
  const offset = (page - 1) * limit;

  const [pickedResult, packedResult, shippedResult] = await Promise.all([
    pool.query(`
      SELECT * FROM monitoring_data 
      JOIN warehouse ON monitoring_data.warehouse_location = warehouse.id_warehouse 
      WHERE status = 'Picked' 
        AND picked_date IS NOT NULL 
        AND packed_date IS NULL 
        AND picked_date BETWEEN NOW() - INTERVAL '7 days' AND NOW() 
      ORDER BY picked_date DESC 
      LIMIT $1 OFFSET $2
    `, [limit, offset]),
    pool.query(`
      SELECT * FROM monitoring_data 
      JOIN warehouse ON monitoring_data.warehouse_location = warehouse.id_warehouse 
      WHERE status = 'Packed' 
        AND packed_date BETWEEN NOW() - INTERVAL '7 days' AND NOW() 
      ORDER BY packed_date DESC 
      LIMIT $1 OFFSET $2
    `, [limit, offset]),
    pool.query(`
      SELECT * FROM monitoring_data 
      JOIN warehouse ON monitoring_data.warehouse_location = warehouse.id_warehouse 
      WHERE status = 'Shipped' 
        AND shipped_date BETWEEN NOW() - INTERVAL '7 days' AND NOW() 
      ORDER BY shipped_date DESC 
      LIMIT $1 OFFSET $2
    `, [limit, offset]),
  ]);

  res.render('dashboard', {
    pickedData: pickedResult.rows,
    packedData: packedResult.rows,
    shippedData: shippedResult.rows
  });
});

// =================== Dashboard JSON (AJAX/Auto Reload) =====================
router.get('/dashboardData', async (req, res) => {
  const limit = 10;
  const pagePicked = parseInt(req.query.pagePicked) || 1;
  const pagePacked = parseInt(req.query.pagePacked) || 1;
  const pageShipped = parseInt(req.query.pageShipped) || 1;

  const offsetPicked = (pagePicked - 1) * limit;
  const offsetPacked = (pagePacked - 1) * limit;
  const offsetShipped = (pageShipped - 1) * limit;

  const [pickedResult, packedResult, shippedResult, pickedCount, packedCount, shippedCount] = await Promise.all([
    pool.query(`
      SELECT * FROM monitoring_data 
      JOIN warehouse ON monitoring_data.warehouse_location = warehouse.id_warehouse 
      WHERE status = 'Picked' 
        AND picked_date IS NOT NULL 
        AND packed_date IS NULL 
        AND picked_date BETWEEN NOW() - INTERVAL '7 days' AND NOW() 
      ORDER BY picked_date DESC 
      LIMIT $1 OFFSET $2
    `, [limit, offsetPicked]),

    pool.query(`
      SELECT * FROM monitoring_data 
      JOIN warehouse ON monitoring_data.warehouse_location = warehouse.id_warehouse 
      WHERE status = 'Packed' 
        AND packed_date BETWEEN NOW() - INTERVAL '7 days' AND NOW() 
      ORDER BY packed_date DESC 
      LIMIT $1 OFFSET $2
    `, [limit, offsetPacked]),

    pool.query(`
      SELECT * FROM monitoring_data 
      JOIN warehouse ON monitoring_data.warehouse_location = warehouse.id_warehouse 
      WHERE status = 'Shipped' 
        AND shipped_date BETWEEN NOW() - INTERVAL '7 days' AND NOW() 
      ORDER BY shipped_date DESC 
      LIMIT $1 OFFSET $2
    `, [limit, offsetShipped]),

    pool.query(`SELECT COUNT(*) FROM monitoring_data WHERE status = 'Picked' AND picked_date IS NOT NULL AND packed_date IS NULL AND picked_date BETWEEN NOW() - INTERVAL '7 days' AND NOW()`),
    pool.query(`SELECT COUNT(*) FROM monitoring_data WHERE status = 'Packed' AND packed_date BETWEEN NOW() - INTERVAL '7 days' AND NOW()`),
    pool.query(`SELECT COUNT(*) FROM monitoring_data WHERE status = 'Shipped' AND shipped_date BETWEEN NOW() - INTERVAL '7 days' AND NOW()`),
  ]);

  res.json({
    pickedData: pickedResult.rows,
    packedData: packedResult.rows,
    shippedData: shippedResult.rows,
    pickedTotal: parseInt(pickedCount.rows[0].count),
    packedTotal: parseInt(packedCount.rows[0].count),
    shippedTotal: parseInt(shippedCount.rows[0].count)
  });
});

module.exports = router;