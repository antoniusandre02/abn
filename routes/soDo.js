const express = require('express');
const router = express.Router();
const pool = require('../db');
const bwipjs = require('bwip-js');
const fs = require('fs');
const path = require('path'); // Set multer storage
const multer = require('multer');
const csv = require('csv-parser');

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});
const upload = multer({
  storage
});

// POST: Insert Monitoring Data + Generate Barcode
router.post('/create', async (req, res) => {
  try {
    let {
      warehouse_location,
      division_team,
      sales_order_number,
      sales_order_date,
      delivery_order_number,
      delivery_order_date,
      ship_by,
      customer_name,
      ekspedisi_note,
      resi_number,
      weight,
      price,
      eta,
      receive_name
    } = req.body;

    const user_id = req.session.user?.user_id;
    const status = 'Draft';
    const is_done = false;

    // Pastikan hanya angka, lalu tambahkan prefix SO- dan DO-
    sales_order_number = `SO-${sales_order_number.trim().replace(/\D/g, '')}`;
    delivery_order_number = `DO-${delivery_order_number.trim().replace(/\D/g, '')}`;

    if (!delivery_order_number || delivery_order_number.trim() === 'DO-') {
      return res.status(400).send('Delivery Order Number wajib diisi untuk generate barcode.');
    }

    // ✅ CEK APAKAH DO SUDAH ADA
    const checkDO = await pool.query(
      'SELECT COUNT(*) FROM monitoring_data WHERE delivery_order_number = $1',
      [delivery_order_number]
    );

    if (parseInt(checkDO.rows[0].count) > 0) {
      req.flash('errorMessage', `${delivery_order_number} sudah ada di database.`);
      return res.redirect('/soDo');
    }

    const barcodePath = path.join(__dirname, '../public/barcodes', `${delivery_order_number}.png`);

    // Generate barcode image
    try {
      const png = await bwipjs.toBuffer({
        bcid: 'code128',
        text: delivery_order_number,
        scale: 3,
        height: 10,
        includetext: true,
      });

      fs.writeFileSync(barcodePath, png);
      const barcode_base64 = png.toString('base64');

      // Simpan ke DB
      const insertQuery = `
        INSERT INTO monitoring_data (
          id_user_accounts,
          warehouse_location,
          division_team,
          sales_order_number,
          sales_order_date,
          delivery_order_number,
          delivery_order_date,
          status,
          ship_by,
          customer_name,
          ekspedisi_note,
          resi_number,
          weight,
          price,
          eta,
          receive_name,
          created_at,
          is_done,
          barcode_do
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,NOW(),$17,$18)
      `;

      await pool.query(insertQuery, [
        user_id,
        warehouse_location,
        division_team,
        sales_order_number,
        sales_order_date,
        delivery_order_number,
        delivery_order_date,
        status,
        ship_by,
        customer_name,
        ekspedisi_note,
        resi_number,
        weight,
        price,
        eta,
        receive_name,
        is_done,
        barcode_base64
      ]);

      console.log('DATA BODY:', req.body);
      req.flash('successMessage', 'SO / DO sudah berhasil terinput');
      res.redirect('/soDo');

    } catch (err) {
      console.error('Gagal generate barcode:', err);
      req.flash('errorMessage', 'Gagal generate barcode');
      return res.status(500).send('Gagal generate barcode');
    }

  } catch (err) {
    console.error(err);
    res.status(500).send('Gagal menyimpan data dan barcode');
  }
});


// POST: Update Monitoring Data
router.post('/update/:id_monitoring_data', async (req, res) => {
  const id = req.params.id_monitoring_data;
  const {
    warehouse_location,
    division_team,
    sales_order_number,
    sales_order_date,
    delivery_order_number,
    delivery_order_date,
    ship_by,
    customer_name,
    ekspedisi_note,
    resi_number,
    weight,
    price,
    eta,
    receive_name,
    invoicing_date // Tambahkan invoicing_date jika diperlukan
  } = req.body;

  try {
    const updateQuery = `
      UPDATE monitoring_data
      SET
        warehouse_location = $1,
        division_team = $2,
        sales_order_number = $3,
        sales_order_date = $4,
        delivery_order_number = $5,
        delivery_order_date = $6,
        ship_by = $7,
        customer_name = $8,
        ekspedisi_note = $9,
        resi_number = $10,
        weight = $11,
        price = $12,
        eta = $13,
        receive_name = $14,
        invoicing_date = $15,
        update_at = NOW()
      WHERE id_monitoring_data = $16
    `;

    await pool.query(updateQuery, [
      warehouse_location,
      division_team,
      sales_order_number,
      sales_order_date,
      delivery_order_number,
      delivery_order_date,
      ship_by,
      customer_name,
      ekspedisi_note,
      resi_number,
      weight,
      price,
      eta,
      receive_name,
      invoicing_date,
      id
    ]);

    req.flash('successMessage', 'SO / DO sudah berhasil diperbarui');
    res.redirect('/soDo');
  } catch (err) {
    console.error('Error updating SO/DO:', err);
    console.error('Gagal memperbarui data:', err);
    req.flash('errorMessage', 'Gagal memperbarui data:', err);
    res.status(500).send('Gagal memperbarui data');
  }
});

router.post('/upload', upload.single('csvFile'), async (req, res) => {
  if (!req.file) {
    req.flash('errorMessage', 'Tidak ada file yang diupload.');
    return res.redirect('/uploadSODO');
  }

  const filePath = path.join(__dirname, '..', req.file.path);
  const user_id = req.session.user?.user_id || null;

  const results = [];
  let insertedCount = 0;
  let skippedCount = 0;

  try {
    // Baca file CSV
    await new Promise((resolve, reject) => {
      fs.createReadStream(filePath)
        .pipe(csv())
        .on('data', (data) => results.push(data))
        .on('end', resolve)
        .on('error', reject);
    });

    for (const row of results) {
      try {
        const sales_order_number = `SO-${row.sales_order_number?.trim().replace(/\D/g, '')}`;
        const delivery_order_number = `DO-${row.delivery_order_number?.trim().replace(/\D/g, '')}`;
        if (!delivery_order_number || delivery_order_number === 'DO-') continue;

        const {
          rows
        } = await pool.query(
          'SELECT COUNT(*) FROM monitoring_data WHERE delivery_order_number = $1',
          [delivery_order_number]
        );
        if (parseInt(rows[0].count) > 0) {
          skippedCount++;
          continue;
        }

        const png = await bwipjs.toBuffer({
          bcid: 'code128',
          text: delivery_order_number,
          scale: 3,
          height: 10,
          includetext: true,
        });

        const barcodePath = path.join(__dirname, '../public/barcodes', `${delivery_order_number}.png`);
        fs.writeFileSync(barcodePath, png);
        const barcode_base64 = png.toString('base64');

        await pool.query(
          `INSERT INTO monitoring_data (
            id_user_accounts, warehouse_location, division_team, sales_order_number,
            sales_order_date, delivery_order_number, delivery_order_date, status,
            ship_by, customer_name, ekspedisi_note, resi_number,
            weight, price, eta, receive_name, created_at, is_done, barcode_do,
            picked_date, picked_by, packed_date, packed_by, shipped_date, shipped_by, invoicing_date
          ) VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
            $11,$12,$13,$14,$15,$16,NOW(),$17,$18,
            $19,$20,$21,$22,$23,$24, $25
          )`,
          [
            user_id,
            row.warehouse_location,
            row.division_team,
            sales_order_number,
            row.sales_order_date,
            delivery_order_number,
            row.delivery_order_date,
            row.status,
            row.ship_by,
            row.customer_name,
            row.ekspedisi_note,
            row.resi_number,
            row.weight,
            row.price,
            row.eta,
            row.receive_name,
            row.is_done,
            barcode_base64,
            row.picked_date,
            row.picked_by,
            row.packed_date,
            row.packed_by,
            row.shipped_date,
            row.shipped_by,
            row.invoicing_date
          ]
        );
        insertedCount++;
      } catch (err) {
        console.error(`Gagal insert DO ${row.delivery_order_number}:`, err.message);
        continue;
      }
    }
  } catch (err) {
    console.error('Gagal memproses file:', err.message);
  } finally {
    if (!insertedCount && !skippedCount) {
      req.flash('errorMessage', 'Terjadi kesalahan saat memproses file.');
    } else {
      req.flash(
        'successMessage',
        `Upload selesai. ${insertedCount} data berhasil di-insert, ${skippedCount} dilewati karena sudah ada.`
      );
    }
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    return res.redirect('/uploadSODO');
  }
});
module.exports = router;