const express = require('express');
const router = express.Router();
const pool = require('../db');
const isLoggedIn = require('../middlewares/authMiddleware');
const checkRole = require('../middlewares/roleMiddleware');


// Middleware global agar `user` bisa dipakai di semua view
router.use((req, res, next) => {
  res.locals.user = req.session.user;
  next();
});

// Middleware proteksi untuk route login
router.use(['/dashboard', '/scanBarcode', '/soDo', '/soDoEdit', '/uploadSODO', './scanBarcode/scanBarcode', './soDo/create', './soDo/update/:id_monitoring_data', '/soDo/upload'], isLoggedIn);

// Root & Auth Pages
router.get('/', (req, res) => {
  res.render('login');
});

router.get('/login', (req, res) => {
  res.render('login');
});

router.get('/register', (req, res) => {
  res.render('register');
});

// Admin Page
router.get('/createAccounts', checkRole([1]), async (req, res) => {
  try {
    const userSession = req.session.user; // ← ambil dari session

    const optionRoleAccountsResult = await pool.query('SELECT id_role, role_name FROM role_accounts');
    const userAccountsResult = await pool.query('SELECT name, email, password, id, id_role, user_id, created_at, updated_at FROM user_accounts WHERE is_deleted = false');

    const optionRoleAccounts = optionRoleAccountsResult.rows;
    const listUserAccountsRaw = userAccountsResult.rows;

    const listUserAccounts = listUserAccountsRaw.map(user => {
      const role = optionRoleAccounts.find(r => r.id_role === user.id_role);
      return {
        ...user,
        role_name: role ? role.role_name : 'Unknown'
      };
    });

    res.render('createAccounts', {
      user: userSession, // ← KIRIM KE VIEW
      optionRoleAccounts,
      listUserAccounts
    });

  } catch (err) {
    console.error(err);
    res.status(500).send('Gagal mengambil data dari database');
  }
});

router.get('/editAccounts/:id', checkRole([1]), async (req, res) => {
  try {
    const userSession = req.session.user;
    const {
      id
    } = req.params;

    // Ambil data role
    const optionRoleAccountsResult = await pool.query('SELECT id_role, role_name FROM role_accounts');

    // Ambil data user berdasarkan ID
    const itemResult = await pool.query(`
      SELECT * FROM user_accounts 
      JOIN role_accounts ON user_accounts.id_role = role_accounts.id_role 
      WHERE user_accounts.id = $1
    `, [id]);

    const item = itemResult.rows[0];
    const optionRoleAccounts = optionRoleAccountsResult.rows;

    res.render('editAccounts', {
      user: userSession,
      item,
      optionRoleAccounts
    });

  } catch (err) {
    console.error(err);
    res.status(500).send('Gagal mengambil data dari database');
  }
});

router.get('/uploadSODO', checkRole([1]), async (req, res) => {
  try {
    res.render('uploadSoDo');
  } catch (err) {
    console.error(err);
    res.status(500).send('Gagal mengambil data dari database');
  }
});

// Dashboard
router.get('/dashboard', async (req, res) => {
  const limit = 10;
  const page = parseInt(req.query.page) || 1;
  const offset = (page - 1) * limit;

  const [pickedResult, packedResult, shippedResult] = await Promise.all([
    pool.query(`SELECT * FROM monitoring_data JOIN warehouse ON monitoring_data.warehouse_location = warehouse.id_warehouse WHERE status = 'Picked' AND picked_date BETWEEN NOW() - INTERVAL '7 days' AND NOW() ORDER BY picked_date DESC LIMIT $1 OFFSET $2`, [limit, offset]),
    pool.query(`SELECT * FROM monitoring_data JOIN warehouse ON monitoring_data.warehouse_location = warehouse.id_warehouse WHERE status = 'Packed' AND packed_date BETWEEN NOW() - INTERVAL '7 days' AND NOW() ORDER BY packed_date DESC LIMIT $1 OFFSET $2`, [limit, offset]),
    pool.query(`SELECT * FROM monitoring_data JOIN warehouse ON monitoring_data.warehouse_location = warehouse.id_warehouse WHERE status = 'Shipped' AND shipped_date BETWEEN NOW() - INTERVAL '7 days' AND NOW() ORDER BY shipped_date DESC LIMIT $1 OFFSET $2`, [limit, offset]),
  ]);

  res.render('dashboard', {
    pickedData: pickedResult.rows,
    packedData: packedResult.rows,
    shippedData: shippedResult.rows
  });
});

router.get('/dashboardData', async (req, res) => {
  const limit = 10;
  const pagePicked = parseInt(req.query.pagePicked) || 1;
  const pagePacked = parseInt(req.query.pagePacked) || 1;
  const pageShipped = parseInt(req.query.pageShipped) || 1;

  const offsetPicked = (pagePicked - 1) * limit;
  const offsetPacked = (pagePacked - 1) * limit;
  const offsetShipped = (pageShipped - 1) * limit;

  const [pickedResult, packedResult, shippedResult] = await Promise.all([
    pool.query(`
      SELECT * FROM monitoring_data 
      JOIN warehouse ON monitoring_data.warehouse_location = warehouse.id_warehouse 
      WHERE status = 'Picked' 
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
  ]);

  res.json({
    pickedData: pickedResult.rows,
    packedData: packedResult.rows,
    shippedData: shippedResult.rows
  });
});




// Scan Barcode
router.get('/scanBarcode', checkRole([1, 2, 3, 4, 5, 6, 7]), (req, res) => {
  res.render('scanBarcode', {
    message: null
  });
});

// SO/DO Page
router.get('/soDo', checkRole([1, 8, 10, 11]), async (req, res) => {
  try {
    const { search = '', filterDateStart = '', filterDateEnd = '', page = 1 } = req.query;
    const limit = 100;
    const offset = (parseInt(page) - 1) * limit;
    const role = req.session.user?.role;

    const searchKeyword = search.trim();
    const searchPattern = `%${searchKeyword}%`;

    let filterConditions = [];
    let filterValues = [];

    // Pencarian berdasarkan keyword
    if (searchKeyword) {
      filterConditions.push(`(
        m.delivery_order_number ILIKE $${filterValues.length + 1} OR
        m.sales_order_number ILIKE $${filterValues.length + 1} OR
        m.customer_name ILIKE $${filterValues.length + 1} OR
        w.location_warehouse ILIKE $${filterValues.length + 1}
      )`);
      filterValues.push(searchPattern);
    }
    console.log("Ini search pattern",searchPattern);
    // Filter tanggal jika tersedia
    if (filterDateStart && filterDateEnd) {
      filterConditions.push(`m.delivery_order_date BETWEEN $${filterValues.length + 1} AND $${filterValues.length + 2}`);
      filterValues.push(filterDateStart, filterDateEnd);
    }

    const whereClause = filterConditions.length > 0 ? `WHERE ${filterConditions.join(' AND ')}` : '';
    
    const countQuery = `SELECT COUNT(*) FROM monitoring_data m
                        JOIN warehouse w ON m.warehouse_location = w.id_warehouse
                        JOIN division d ON m.division_team = d.id_division
                        ${whereClause}`;

    const totalQueryResult = await pool.query(countQuery, filterValues);
    const totalRows = parseInt(totalQueryResult.rows[0].count);
    const totalPages = Math.ceil(totalRows / limit);

    const dataQuery = `SELECT * FROM monitoring_data m
                      JOIN warehouse w ON m.warehouse_location = w.id_warehouse
                      JOIN division d ON m.division_team = d.id_division
                      ${whereClause}
                      ORDER BY m.id_monitoring_data DESC
                      LIMIT $${filterValues.length + 1} OFFSET $${filterValues.length + 2}`;
    
    const dataValues = [...filterValues, limit, offset];
    const result = await pool.query(dataQuery, dataValues);

    const optionWarehouseLocationResult = await pool.query('SELECT id_warehouse, location_warehouse FROM warehouse');
    const optionDivisionResult = await pool.query('SELECT id_division, name_division FROM division');

    res.render('soDo', {
      data: result.rows,
      role,
      optionWarehouseLocation: optionWarehouseLocationResult.rows,
      optionDivision: optionDivisionResult.rows,
      currentPage: parseInt(page),
      totalPages,
      searchKeyword: searchKeyword,
      filterDateStart,
      filterDateEnd
    });
  } catch (err) {
    console.error('Error while fetching SO/DO:', err);
    res.status(500).send('Gagal mengambil data dari database');
  }
});


router.get('/soDoEdit/:id', checkRole([1, 8, 10, 11]), async (req, res) => {
  try {
    const id = req.params.id;

    const itemResult = await pool.query('SELECT * FROM monitoring_data JOIN warehouse ON monitoring_data.warehouse_location = warehouse.id_warehouse JOIN division ON monitoring_data.division_team = division.id_division WHERE id_monitoring_data = $1', [id]);
    const optionWarehouseLocationResult = await pool.query('SELECT id_warehouse, location_warehouse FROM warehouse');
    const optionDivisionResult = await pool.query('SELECT id_division, name_division FROM division');

    if (itemResult.rows.length === 0) {
      return res.status(404).send('Data tidak ditemukan');
    }

    const item = itemResult.rows[0];
    const role = req.session.user?.role;
    console.log(item);
    res.render('soDoEdit', {
      item,
      role,
      optionWarehouseLocation: optionWarehouseLocationResult.rows,
      optionDivision: optionDivisionResult.rows
    });

  } catch (err) {
    console.error(err);
    res.status(500).send('Gagal mengambil data dari database');
  }
});

router.get('/soDoView/:id', checkRole([1, 8, 10, 11]), async (req, res) => {
  try {
    const id = req.params.id;

    const itemResult = await pool.query('SELECT * FROM monitoring_data JOIN warehouse ON monitoring_data.warehouse_location = warehouse.id_warehouse JOIN division ON monitoring_data.division_team = division.id_division WHERE id_monitoring_data = $1', [id]);
    const optionWarehouseLocationResult = await pool.query('SELECT id_warehouse, location_warehouse FROM warehouse');
    const optionDivisionResult = await pool.query('SELECT id_division, name_division FROM division');

    if (itemResult.rows.length === 0) {
      return res.status(404).send('Data tidak ditemukan');
    }

    const item = itemResult.rows[0];
    const userRole = req.session.user?.id_role; // Pastikan ini sesuai struktur session kamu

    res.render('soDoView', {
      item,
      userRole,
      optionWarehouseLocation: optionWarehouseLocationResult.rows,
      optionDivision: optionDivisionResult.rows
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Gagal mengambil data dari database');
  }
});

module.exports = router;