const pool = require('../../db');
const bwipjs = require('bwip-js');
const PDFDocument = require('pdfkit');

// GET: Halaman list asset
exports.getAssetListPage = async (req, res) => {
  try {
    const { search = '', filterDateStart = '', filterDateEnd = '', page = 1 } = req.query;
    const limit = 100;
    const offset = (parseInt(page) - 1) * limit;
    const role = req.user?.role;
    const searchPattern = `%${search.trim()}%`;

    const optionJenisAssetResult = await pool.query(`SELECT id_jenis_asset, jenis_asset FROM jenis_asset ORDER BY id_jenis_asset ASC`);
    let filterConditions = [];
    let filterValues = [];

    if (search.trim()) {
      filterConditions.push(`(a.kode_asset ILIKE $${filterValues.length + 1} OR a.nama_asset ILIKE $${filterValues.length + 1})`);
      filterValues.push(searchPattern);
    }

    if (filterDateStart && filterDateEnd) {
      filterConditions.push(`a.created_at BETWEEN $${filterValues.length + 1} AND $${filterValues.length + 2}`);
      filterValues.push(filterDateStart, filterDateEnd);
    }

    const whereClause = filterConditions.length > 0 ? `WHERE ${filterConditions.join(' AND ')}` : '';
    const countQuery = `SELECT COUNT(*) FROM asset a ${whereClause}`;
    const totalRows = parseInt((await pool.query(countQuery, filterValues)).rows[0].count);
    const totalPages = Math.ceil(totalRows / limit);

    const dataQuery = `SELECT * FROM asset a ${whereClause} ORDER BY a.kode_asset DESC LIMIT $${filterValues.length + 1} OFFSET $${filterValues.length + 2}`;
    const dataValues = [...filterValues, limit, offset];
    const result = await pool.query(dataQuery, dataValues);

    res.render('asset', {
      data: result.rows,
      role,
      currentPage: parseInt(page),
      totalPages,
      searchKeyword: search.trim(),
      optionJenisAsset: optionJenisAssetResult.rows,
      filterDateStart,
      filterDateEnd
    });
  } catch (err) {
    console.error('Error while fetching Asset:', err);
    res.status(500).send('Gagal mengambil data dari database');
  }
};

// GET: Halaman edit asset
exports.getAssetEditPage = async (req, res) => {
  try {
    const id = req.params.id;
    const itemResult = await pool.query('SELECT * FROM asset WHERE id_asset = $1', [id]);

    if (!itemResult.rows.length) return res.status(404).send('Data tidak ditemukan');

    const optionJenisAssetResult = await pool.query(`SELECT id_jenis_asset, jenis_asset FROM jenis_asset`);
    res.render('assetEdit', {
      item: itemResult.rows[0],
      role: req.user?.role,
      optionJenisAsset: optionJenisAssetResult.rows
    });
  } catch (err) {
    console.error('Error while fetching Asset Edit:', err);
    res.status(500).send('Gagal mengambil data dari database');
  }
};

// POST: Tambah asset baru
exports.createAsset = async (req, res) => {
  const {
    nama_asset, sn_asset, status_asset, tahun_pembelian,
    brand_asset, jenis_asset, notes_asset
  } = req.body;

  const user_id = req.session.user?.user_id;
  if (!user_id) {
    req.flash('errorMessage', 'Session user tidak ditemukan. Silakan login kembali.');
    return res.redirect('/asset');
  }

  try {
    const result = await pool.query(`
      SELECT MAX(CAST(SUBSTRING(kode_asset FROM 8) AS INTEGER)) AS max_nomor
      FROM asset WHERE jenis_asset = $1`, [jenis_asset]);

    const nomorUrut = result.rows[0].max_nomor ? result.rows[0].max_nomor + 1 : 1;
    const nomorAssetFormatted = String(nomorUrut).padStart(3, '0');
    const kode_asset = `ABN-${jenis_asset}${nomorAssetFormatted}`;

    const cekDuplikat = await pool.query('SELECT * FROM asset WHERE kode_asset = $1', [kode_asset]);
    if (cekDuplikat.rows.length > 0) {
      req.flash('errorMessage', 'Asset sudah ada.');
      return res.redirect('/asset');
    }

    await pool.query(`
      INSERT INTO asset (
        kode_asset, nama_asset, sn_asset, status_asset, barcode,
        created_at, user_id, tahun_pembelian, brand_asset, jenis_asset, notes_asset
      ) VALUES ($1, $2, $3, $4, $5, NOW(), $6, $7, $8, $9, $10)
    `, [kode_asset, nama_asset, sn_asset, status_asset, kode_asset, user_id,
        tahun_pembelian, brand_asset, jenis_asset, notes_asset]);
    
    console.log('INI req body', req.body);
    req.flash('successMessage', 'Asset berhasil ditambahkan.');
    res.redirect('/asset');
  } catch (err) {
    console.error('Error saat insert asset:', err);
    req.flash('errorMessage', 'Gagal menambahkan asset.');
    res.redirect('/asset');
  }
};

// POST: Update asset
exports.updateAsset = async (req, res) => {
  const { id } = req.params;
  const {
    nama_asset, sn_asset, status_asset, tahun_pembelian,
    brand_asset, jenis_asset, notes_asset
  } = req.body;

  const user_id = req.session.user?.user_id;

  try {
    await pool.query(`
      UPDATE asset
      SET nama_asset = $1, sn_asset = $2, status_asset = $3,
          updated_at = NOW(), user_id = $4,
          tahun_pembelian = $5, brand_asset = $6,
          jenis_asset = $7, notes_asset = $8
      WHERE id_asset = $9
    `, [nama_asset, sn_asset, status_asset, user_id, tahun_pembelian,
        brand_asset, jenis_asset, notes_asset, id]);

    req.flash('successMessage', 'Asset berhasil diperbarui.');
    res.redirect('/asset');
  } catch (err) {
    console.error('Error saat update asset:', err);
    req.flash('errorMessage', 'Gagal memperbarui asset.');
    res.redirect('/asset');
  }
};

// GET: Generate Barcode Asset PDF
exports.generateBarcodePDF = async (req, res) => {
  const { kode_asset } = req.params;
  try {
    const pngBuffer = await bwipjs.toBuffer({
      bcid: 'qrcode',
      text: kode_asset,
      scale: 4,
      includetext: false,
      padding: 0
    });

    const docWidth = 45 * 2.83465;
    const docHeight = 15 * 2.83465;
    const doc = new PDFDocument({ size: [docWidth, docHeight], margin: 0 });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${kode_asset}.pdf"`);

    doc.pipe(res);
    doc.image(pngBuffer, 10, 5, { width: 33 });

    const textX = 50;
    const lineHeight = 11;
    const fontSize = 12;
    const startY = (docHeight - (lineHeight * 3)) / 2;

    doc.font('Helvetica-Bold').fontSize(fontSize)
      .text('ABADINUSA', textX, startY)
      .text('ASSET', textX, startY + lineHeight)
      .text(kode_asset, textX, startY + 2 * lineHeight);

    doc.end();
  } catch (err) {
    console.error('Error saat generate barcode PDF:', err);
    res.status(500).send('Gagal generate barcode PDF');
  }
};