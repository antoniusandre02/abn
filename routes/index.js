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
router.use(['/dashboard', '/scanBarcode', '/soDo', '/soDoEdit', '/uploadSODO', './scanBarcode/scanBarcode', './soDo/create', './soDo/update/:id_monitoring_data', '/soDo/upload', '/karyawan', '/asset', '/pinjamAsset', '/pinjamAssetEdit/:id'], isLoggedIn);

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

//============================================================== Create Account for Admin Page ===========================================================================================
router.get('/createAccounts', checkRole([1, 13]), async (req, res) => {
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

//============================================================== Dashboard Page ===========================================================================================
router.get('/dashboard', async (req, res) => {
  const limit = 10;
  const page = parseInt(req.query.page) || 1;
  const offset = (page - 1) * limit;

  const [pickedResult, packedResult, shippedResult] = await Promise.all([
    pool.query(`SELECT * FROM monitoring_data JOIN warehouse ON monitoring_data.warehouse_location = warehouse.id_warehouse WHERE status = 'Picked' AND picked_date IS NOT NULL AND packed_date IS NULL AND picked_date BETWEEN NOW() - INTERVAL '7 days' AND NOW() ORDER BY picked_date DESC LIMIT $1 OFFSET $2`, [limit, offset]),
    pool.query(`SELECT * FROM monitoring_data JOIN warehouse ON monitoring_data.warehouse_location = warehouse.id_warehouse WHERE status = 'Packed' AND packed_date BETWEEN NOW() - INTERVAL '7 days' AND NOW() ORDER BY packed_date DESC LIMIT $1 OFFSET $2`, [limit, offset]),
    pool.query(`SELECT * FROM monitoring_data JOIN warehouse ON monitoring_data.warehouse_location = warehouse.id_warehouse WHERE status = 'Shipped' AND shipped_date BETWEEN NOW() - INTERVAL '7 days' AND NOW() ORDER BY shipped_date DESC LIMIT $1 OFFSET $2`, [limit, offset]),
  ]);

  res.render('dashboard', {
    pickedData: pickedResult.rows,
    packedData: packedResult.rows,
    shippedData: shippedResult.rows
  });
});

// API: Dashboard paginated data with total count
router.get('/dashboardData', async (req, res) => {
  const limit = 10;
  const pagePicked = parseInt(req.query.pagePicked) || 1;
  const pagePacked = parseInt(req.query.pagePacked) || 1;
  const pageShipped = parseInt(req.query.pageShipped) || 1;

  const offsetPicked = (pagePicked - 1) * limit;
  const offsetPacked = (pagePacked - 1) * limit;
  const offsetShipped = (pageShipped - 1) * limit;
  console.log("Query pageShipped:", pageShipped, "Offset:", offsetShipped);

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


//============================================================== Scan Barcode ===========================================================================================
router.get('/scanBarcode', checkRole([1, 2, 3, 4, 5, 6, 7, 12]), (req, res) => {
  res.render('scanBarcode', {
    message: null
  });
});

//============================================================== SO / DO Page ===========================================================================================
router.get('/soDo', checkRole([1, 8, 10, 11, 12, 14]), async (req, res) => {
  try {
    const { search = '', filterDateStart = '', filterDateEnd = '', page = 1 } = req.query;
    const limit = 100;
    const offset = (parseInt(page) - 1) * limit;
    const role = req.session.user?.role;
    
    const searchKeyword = search.trim();
    const searchPattern = `%${searchKeyword}%`;

    let filterConditions = [];
    let filterValues = [];
    // Tambahkan filter invoicing_date IS NULL khusus untuk role Finance (8)
    if (role === 8) {
      filterConditions.push(`m.invoicing_date IS NULL`);
    }

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
    const optionDivisionResult = await pool.query('SELECT id_division, name_division FROM division WHERE id_division BETWEEN 4 AND 15');

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

router.get('/soDoEdit/:id', checkRole([1, 8, 10, 11, 12]), async (req, res) => {
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

router.get('/soDoView/:id', checkRole([1, 8, 10, 11, 12, 14]), async (req, res) => {
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

router.get('/uploadSODO', checkRole([1]), async (req, res) => {
  try {
    res.render('uploadSoDo');
  } catch (err) {
    console.error(err);
    res.status(500).send('Gagal mengambil data dari database');
  }
});

//==============================================================Inventory Menu===========================================================================================

//karyawan 
router.get('/karyawan', checkRole([1, 13]), async (req, res) => {
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
        k.nama_karyawan ILIKE $${filterValues.length + 1} OR
        k.nomor_hp ILIKE $${filterValues.length + 1} OR
        k.email_karyawan ILIKE $${filterValues.length + 1} OR
        dep.department_name ILIKE $${filterValues.length + 1} OR
        d.name_division ILIKE $${filterValues.length + 1}
      )`);
      filterValues.push(searchPattern);
    }
    console.log("Ini search pattern",searchPattern);
    // Filter tanggal jika tersedia
    if (filterDateStart && filterDateEnd) {
      filterConditions.push(`k.created_at BETWEEN $${filterValues.length + 1} AND $${filterValues.length + 2}`);
      filterValues.push(filterDateStart, filterDateEnd);
    }

    const whereClause = filterConditions.length > 0 ? `WHERE ${filterConditions.join(' AND ')}` : '';
    
    const countQuery = `SELECT COUNT(*) FROM karyawan k
                        JOIN department dep ON dep.id_department = k.departemen_karyawan
                        JOIN division d ON d.id_division = k.divisi_karyawan
                        ${whereClause}`;

    const totalQueryResult = await pool.query(countQuery, filterValues);
    const totalRows = parseInt(totalQueryResult.rows[0].count);
    const totalPages = Math.ceil(totalRows / limit);

    const dataQuery = `SELECT * FROM karyawan k
                        JOIN department dep ON dep.id_department = k.departemen_karyawan
                        JOIN division d ON d.id_division = k.divisi_karyawan
                      ${whereClause}
                      ORDER BY k.id_karyawan DESC
                      LIMIT $${filterValues.length + 1} OFFSET $${filterValues.length + 2}`;
    
    const dataValues = [...filterValues, limit, offset];
    const result = await pool.query(dataQuery, dataValues);

    const optionDepartmentResult = await pool.query('SELECT id_department, department_name FROM department');
    const optionDivisionResult = await pool.query('SELECT id_division, name_division FROM division WHERE id_division BETWEEN 16 AND 23');

    res.render('karyawan', {
      data: result.rows,
      role,
      optionDepartment: optionDepartmentResult.rows,
      optionDivision: optionDivisionResult.rows,
      currentPage: parseInt(page),
      totalPages,
      searchKeyword: searchKeyword,
      filterDateStart,
      filterDateEnd
    });

  } catch (err) {
    console.error(err);
    res.status(500).send('Gagal mengambil data dari database');
  }
});

router.get('/karyawanEdit/:id', checkRole([1, 13]), async (req, res) => {
  try {
    const id = req.params.id;

    const itemResult = await pool.query(`SELECT * FROM karyawan k 
                                        JOIN department dep ON k.departemen_karyawan = dep.id_department
                                        JOIN division d ON k.divisi_karyawan = d.id_division
                                        WHERE id_karyawan = $1`, [id]);
    const divisiResult = await pool.query('SELECT * FROM division');
    const departemenResult = await pool.query('SELECT * FROM department');

    if (itemResult.rows.length === 0) {
      return res.status(404).send('Data tidak ditemukan');
    }

    const item = itemResult.rows[0];
    const role = req.session.user?.role;

    console.log(item);
    res.render('karyawanEdit', {
      item,
      role,
      divisi: divisiResult.rows,
      departemen: departemenResult.rows
    });
  } catch (err) {
    console.error('Error while fetching Asset:', err);
    res.status(500).send('Gagal mengambil data dari database');
  }
});

//ASSET
router.get('/asset', checkRole([1, 13]), async (req, res) => {
  try {
    const { search = '', filterDateStart = '', filterDateEnd = '', page = 1 } = req.query;
    const limit = 100;
    const offset = (parseInt(page) - 1) * limit;
    const role = req.session.user?.role;
    
    const searchKeyword = search.trim();
    const searchPattern = `%${searchKeyword}%`;

    const optionJenisAsssetResult = await pool.query(`SELECT id_jenis_asset, jenis_asset FROM jenis_asset`);

    let filterConditions = [];
    let filterValues = [];

    // Pencarian berdasarkan keyword
    if (searchKeyword) {
      filterConditions.push(`(
        a.kode_asset ILIKE $${filterValues.length + 1} OR
        a.nama_asset ILIKE $${filterValues.length + 1} 
      )`);
      filterValues.push(searchPattern);
    }
    console.log("Ini search pattern",searchPattern);
    // Filter tanggal jika tersedia
    if (filterDateStart && filterDateEnd) {
      filterConditions.push(`a.created_at BETWEEN $${filterValues.length + 1} AND $${filterValues.length + 2}`);
      filterValues.push(filterDateStart, filterDateEnd);
    }

    const whereClause = filterConditions.length > 0 ? `WHERE ${filterConditions.join(' AND ')}` : '';
    
    const countQuery = `SELECT COUNT(*) FROM asset a
                        ${whereClause}`;

    const totalQueryResult = await pool.query(countQuery, filterValues);
    const totalRows = parseInt(totalQueryResult.rows[0].count);
    const totalPages = Math.ceil(totalRows / limit);

    const dataQuery = `SELECT * FROM asset a
                      ${whereClause}
                      ORDER BY a.id_asset DESC
                      LIMIT $${filterValues.length + 1} OFFSET $${filterValues.length + 2}`;
    
    const dataValues = [...filterValues, limit, offset];
    const result = await pool.query(dataQuery, dataValues);

    
    res.render('asset', {
      data: result.rows,
      role,
      currentPage: parseInt(page),
      totalPages,
      searchKeyword: searchKeyword,
      optionJenisAsset: optionJenisAsssetResult.rows,
      filterDateStart,
      filterDateEnd
    });
  } catch (err) {
    console.error('Error while fetching Asset:', err);
    res.status(500).send('Gagal mengambil data dari database');
  }
});

router.get('/assetEdit/:id', checkRole([1, 13]), async (req, res) => {
  try {
    const id = req.params.id;

    const itemResult = await pool.query('SELECT * FROM asset WHERE id_asset = $1', [id]);

    if (itemResult.rows.length === 0) {
      return res.status(404).send('Data tidak ditemukan');
    }

    const optionJenisAsssetResult = await pool.query(`SELECT id_jenis_asset, jenis_asset FROM jenis_asset`);
    const item = itemResult.rows[0];
    const role = req.session.user?.role;
    console.log(item);
    res.render('assetEdit', {
      item,
      role,
      optionJenisAsset: optionJenisAsssetResult.rows
    });
  } catch (err) {
    console.error('Error while fetching Asset:', err);
    res.status(500).send('Gagal mengambil data dari database');
  }
});

//PINJAM ASSET
router.get('/pinjamAsset', checkRole([1, 13]), async (req, res) => {
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
        k.nama_karyawan ILIKE $${filterValues.length + 1} OR
        k.nomor_hp ILIKE $${filterValues.length + 1} OR
        k.email_karyawan ILIKE $${filterValues.length + 1} OR
        dep.department_name ILIKE $${filterValues.length + 1} OR
        d.name_division ILIKE $${filterValues.length + 1}
      )`);
      filterValues.push(searchPattern);
    }

    // Filter tanggal jika tersedia
    if (filterDateStart && filterDateEnd) {
      filterConditions.push(`pa.created_at BETWEEN $${filterValues.length + 1} AND $${filterValues.length + 2}`);
      filterValues.push(filterDateStart, filterDateEnd);
    }

    const whereClause = filterConditions.length > 0 ? `WHERE ${filterConditions.join(' AND ')}` : '';

    // Total count (dihitung per karyawan)
    const countQuery = `
      SELECT COUNT(DISTINCT pa.id_pinjam_asset) AS total
      FROM pinjam_asset pa
      JOIN detail_pinjam_asset dpa ON pa.id_pinjam_asset = dpa.id_pinjam_asset
      JOIN asset a ON dpa.id_asset = a.id_asset
      JOIN karyawan k ON dpa.id_karyawan = k.id_karyawan
      JOIN division d ON k.divisi_karyawan = d.id_division
      JOIN department dep ON k.departemen_karyawan = dep.id_department
      ${whereClause}
    `;
    const totalQueryResult = await pool.query(countQuery, filterValues);
    const totalRows = parseInt(totalQueryResult.rows[0].total);
    const totalPages = Math.ceil(totalRows / limit);

    // Query data per karyawan
    const dataQuery = `
      SELECT pa.id_pinjam_asset, k.id_karyawan, k.nama_karyawan, k.employee_id, k.nomor_hp, k.email_karyawan, dep.department_name, d.name_division, COUNT(dpa.id_asset) AS jumlah_asset, STRING_AGG(a.kode_asset, ', ') AS daftar_kode_asset, dpa.tanggal_pengembalian
      FROM pinjam_asset pa
      JOIN detail_pinjam_asset dpa ON pa.id_pinjam_asset = dpa.id_pinjam_asset
      JOIN asset a ON dpa.id_asset = a.id_asset
      JOIN karyawan k ON dpa.id_karyawan = k.id_karyawan
      JOIN division d ON k.divisi_karyawan = d.id_division
      JOIN department dep ON k.departemen_karyawan = dep.id_department
      ${whereClause}
      GROUP BY k.id_karyawan, k.nama_karyawan, k.employee_id, k.nomor_hp, k.email_karyawan, dep.department_name, d.name_division, pa.id_pinjam_asset, dpa.tanggal_pengembalian
      ORDER BY k.nama_karyawan ASC
      LIMIT $${filterValues.length + 1} OFFSET $${filterValues.length + 2}
    `;
    const dataValues = [...filterValues, limit, offset];
    const result = await pool.query(dataQuery, dataValues);

    // Dropdown asset tersedia
    const optionAssetResult = await pool.query(`
      SELECT id_asset, kode_asset, nama_asset, sn_asset, status_asset, barcode, user_id 
      FROM asset 
      WHERE status_asset = 'TERSEDIA'
    `);

    // Dropdown karyawan belum resign
    const optionKaryawanResult = await pool.query(`
      SELECT id_karyawan, nama_karyawan, is_resign, user_id, nomor_hp, email_karyawan, divisi_karyawan, name_division, departemen_karyawan, department_name, employee_id 
      FROM karyawan k 
      JOIN division d ON k.divisi_karyawan = d.id_division 
      JOIN department dep ON k.departemen_karyawan = dep.id_department 
      WHERE d.id_division BETWEEN 16 AND 23 AND is_resign = false
    `);

    res.render('pinjamAsset', {
      data: result.rows,
      role,
      optionAsset: optionAssetResult.rows,
      optionKaryawan: optionKaryawanResult.rows,
      currentPage: parseInt(page),
      totalPages,
      searchKeyword,
      filterDateStart,
      filterDateEnd
    });

  } catch (err) {
    console.error(err);
    res.status(500).send('Gagal mengambil data dari database');
  }
});

router.get('/pinjamAssetEdit/:id', checkRole([1, 13]), async (req, res) => {
  try {
    const { id } = req.params;

    // Ambil data utama pinjam_asset
    const itemResult = await pool.query(
      `SELECT pa.id_pinjam_asset, k.id_karyawan, k.nama_karyawan, k.employee_id, k.nomor_hp, k.email_karyawan, dep.department_name, d.name_division, a.kode_asset, a.nama_asset, a.sn_asset, a.status_asset, a.brand_asset, a.tahun_pembelian, pa.notes, dpa.tanggal_peminjaman, dpa.tanggal_pengembalian, ja.jenis_asset 
      FROM pinjam_asset pa
      JOIN detail_pinjam_asset dpa ON pa.id_pinjam_asset = dpa.id_pinjam_asset
      JOIN asset a ON dpa.id_asset = a.id_asset
      JOIN jenis_asset ja ON a.jenis_asset = ja.id_jenis_asset
      JOIN karyawan k ON dpa.id_karyawan = k.id_karyawan
      JOIN division d ON k.divisi_karyawan = d.id_division
      JOIN department dep ON k.departemen_karyawan = dep.id_department
      WHERE pa.id_pinjam_asset = $1`,
      [id]
    );
    const item = itemResult.rows[0];
    const itemAssets = itemResult.rows.map(row => ({
      kode_asset: row.kode_asset,
      nama_asset: row.nama_asset,
      sn_asset: row.sn_asset,
      brand_asset: row.brand_asset,
      tahun_pembelian: row.tahun_pembelian,
      jenis_asset: row.jenis_asset
    }));

    // Dropdown asset tersedia
    const optionAssetResult = await pool.query(`
      SELECT id_asset, kode_asset, nama_asset, sn_asset
      FROM asset
      WHERE status_asset = 'TERSEDIA'
    `);

    // Dropdown karyawan belum resign
    const optionKaryawanResult = await pool.query(`
      SELECT id_karyawan, nama_karyawan
      FROM karyawan
      WHERE is_resign = false
    `);

    res.render('pinjamAssetEdit', {
      item,
      itemAssets,
      optionAsset: optionAssetResult.rows,
      optionKaryawan: optionKaryawanResult.rows
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Gagal memuat data edit');
  }
});

module.exports = router;