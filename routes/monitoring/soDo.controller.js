const pool = require('../../db');
const bwipjs = require('bwip-js');
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const {
    Parser
} = require('json2csv');

// GET: List Page
exports.getListPage = async (req, res) => {
    try {
        const {
            search = '', filterDateStart = '', filterDateEnd = '', page = 1
        } = req.query;
        const limit = 100;
        const offset = (parseInt(page) - 1) * limit;
        const role = req.user?.role;
        const searchPattern = `%${search.trim()}%`;

        let filterConditions = [];
        let filterValues = [];
        if (role === 8) {
            filterConditions.push(`m.invoicing_date IS NULL`);
            filterConditions.push(`TRIM(m.receive_name) <> ''`);
            filterConditions.push(`m.receive_name IS NOT NULL`);
            filterConditions.push(`TRIM(m.resi_number) <> ''`);
            filterConditions.push(`m.resi_number IS NOT NULL`);
        }

        if (search.trim()) {
            filterConditions.push(`(
                m.delivery_order_number ILIKE $${filterValues.length + 1} OR
                m.sales_order_number ILIKE $${filterValues.length + 1} OR
                m.customer_name ILIKE $${filterValues.length + 1} OR
                name_division ILIKE $${filterValues.length + 1} OR
                m.ship_by ILIKE $${filterValues.length + 1} OR
                m.ekspedisi_note ILIKE $${filterValues.length + 1} OR
                w.location_warehouse ILIKE $${filterValues.length + 1})`);
            filterValues.push(searchPattern);
        }

        if (filterDateStart && filterDateEnd) {
            filterConditions.push(`m.delivery_order_date BETWEEN $${filterValues.length + 1} AND $${filterValues.length + 2}`);
            filterValues.push(filterDateStart, filterDateEnd);
        }

        const whereClause = filterConditions.length > 0 ? `WHERE ${filterConditions.join(' AND ')}` : '';
        const countQuery = `SELECT COUNT(*) FROM monitoring_data m JOIN warehouse w ON m.warehouse_location = w.id_warehouse JOIN division d ON m.division_team = d.id_division ${whereClause}`;
        const totalQueryResult = await pool.query(countQuery, filterValues);
        const totalRows = parseInt(totalQueryResult.rows[0].count);
        const totalPages = Math.ceil(totalRows / limit);

        const dataQuery = `SELECT * FROM monitoring_data m JOIN warehouse w ON m.warehouse_location = w.id_warehouse JOIN division d ON m.division_team = d.id_division ${whereClause} ORDER BY m.id_monitoring_data DESC LIMIT $${filterValues.length + 1} OFFSET $${filterValues.length + 2}`;
        const dataValues = [...filterValues, limit, offset];
        const result = await pool.query(dataQuery, dataValues);

        const [warehouses, divisions] = await Promise.all([
            pool.query('SELECT id_warehouse, location_warehouse FROM warehouse'),
            pool.query('SELECT id_division, name_division FROM division WHERE id_division BETWEEN 4 AND 15')
        ]);

        res.render('soDo', {
            data: result.rows,
            role,
            optionWarehouseLocation: warehouses.rows,
            optionDivision: divisions.rows,
            currentPage: parseInt(page),
            totalPages,
            itemsPerPage: limit,
            searchKeyword: search.trim(),
            filterDateStart,
            filterDateEnd
        });
    } catch (err) {
        console.error('Error while fetching SO/DO:', err);
        res.status(500).send('Gagal mengambil data dari database');
    }
};

// GET: Edit Page
exports.getEditPage = async (req, res) => {
    try {
        const {
            id
        } = req.params;
        const [itemResult, warehouses, divisions] = await Promise.all([
            pool.query('SELECT * FROM monitoring_data JOIN warehouse ON monitoring_data.warehouse_location = warehouse.id_warehouse JOIN division ON monitoring_data.division_team = division.id_division WHERE id_monitoring_data = $1', [id]),
            pool.query('SELECT id_warehouse, location_warehouse FROM warehouse'),
            pool.query('SELECT id_division, name_division FROM division')
        ]);

        if (!itemResult.rows.length) return res.status(404).send('Data tidak ditemukan');

        res.render('soDoEdit', {
            item: itemResult.rows[0],
            role: req.user?.role,
            optionWarehouseLocation: warehouses.rows,
            optionDivision: divisions.rows
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Gagal mengambil data dari database');
    }
};

// GET: View Page
exports.getViewPage = async (req, res) => {
    try {
        const {
            id
        } = req.params;
        const [itemResult, warehouses, divisions] = await Promise.all([
            pool.query('SELECT * FROM monitoring_data JOIN warehouse ON monitoring_data.warehouse_location = warehouse.id_warehouse JOIN division ON monitoring_data.division_team = division.id_division WHERE id_monitoring_data = $1', [id]),
            pool.query('SELECT id_warehouse, location_warehouse FROM warehouse'),
            pool.query('SELECT id_division, name_division FROM division')
        ]);

        if (!itemResult.rows.length) return res.status(404).send('Data tidak ditemukan');

        res.render('soDoView', {
            item: itemResult.rows[0],
            userRole: req.user?.role,
            optionWarehouseLocation: warehouses.rows,
            optionDivision: divisions.rows
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Gagal mengambil data dari database');
    }
};

// GET: Upload Page
exports.getUploadPage = (req, res) => {
    res.render('uploadSoDo');
};

// Ambil detail monitoring_data by ID
exports.getDetailMonitoring = async (req, res) => {
    const {
        id
    } = req.params;

    try {
        const result = await pool.query(
            `SELECT delivery_order_number, invoicing_date, customer_name, location_warehouse, ship_by, eta, receive_name, price, resi_number 
            FROM monitoring_data
            JOIN warehouse ON monitoring_data.warehouse_location = warehouse.id_warehouse
            WHERE id_monitoring_data = $1`,
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Data tidak ditemukan'
            });
        }

        res.json(result.rows[0]);
    } catch (err) {
        console.error('Gagal ambil detail monitoring:', err);
        res.status(500).json({
            success: false,
            message: 'Gagal ambil data'
        });
    }
};

// history finance checklist by 7 days from now
exports.getHistoryCheck = async (req, res) => {
    try {
        const {
            search = '',
                filterDateStart = '',
                filterDateEnd = '',
                page = 1
        } = req.query;
        const limit = 100;
        const offset = (parseInt(page) - 1) * limit;
        const role = req.user?.role;
        const searchPattern = `%${search.trim()}%`;

        let filterConditions = [
            `m.invoicing_date IS NOT NULL`,
            `m.invoicing_date BETWEEN NOW() - INTERVAL '7 days' AND NOW()`
        ];
        let filterValues = [];

        if (search.trim()) {
            filterConditions.push(`(
                m.delivery_order_number ILIKE $${filterValues.length + 1} OR
                m.sales_order_number ILIKE $${filterValues.length + 1} OR
                m.customer_name ILIKE $${filterValues.length + 1} OR
                d.name_division ILIKE $${filterValues.length + 1} OR
                w.location_warehouse ILIKE $${filterValues.length + 1}
            )`);
            filterValues.push(searchPattern);
        }

        if (filterDateStart && filterDateEnd) {
            filterConditions.push(`m.delivery_order_date BETWEEN $${filterValues.length + 1} AND $${filterValues.length + 2}`);
            filterValues.push(filterDateStart, filterDateEnd);
        }

        const whereClause = filterConditions.length > 0 ?
            `WHERE ${filterConditions.join(' AND ')}` :
            '';

        const countQuery = `
        SELECT COUNT(*) 
            FROM monitoring_data m
            JOIN division d ON m.division_team = d.id_division
            JOIN warehouse w ON m.warehouse_location = w.id_warehouse
            ${whereClause}
        `;
        const totalQueryResult = await pool.query(countQuery, filterValues);
        const totalRows = parseInt(totalQueryResult.rows[0].count);
        const totalPages = Math.ceil(totalRows / limit);

        const dataQuery = `
        SELECT 
            m.id_monitoring_data, m.id_user_accounts, m.sales_order_number, 
            m.delivery_order_number, m.delivery_order_date, m.status, 
            m.ship_by, m.customer_name, m.resi_number, m.ekspedisi_note, 
            m.weight, m.invoicing_date, m.receive_name, m.price, m.eta, 
            m.warehouse_location, w.location_warehouse, 
            m.division_team, d.name_division 
        FROM monitoring_data m
        JOIN division d ON m.division_team = d.id_division
        JOIN warehouse w ON m.warehouse_location = w.id_warehouse
        ${whereClause}
        ORDER BY m.invoicing_date DESC
        LIMIT $${filterValues.length + 1} OFFSET $${filterValues.length + 2}
        `;

        const dataValues = [...filterValues, limit, offset];
        const result = await pool.query(dataQuery, dataValues);

        const [warehouses, divisions] = await Promise.all([
            pool.query('SELECT id_warehouse, location_warehouse FROM warehouse'),
            pool.query('SELECT id_division, name_division FROM division WHERE id_division BETWEEN 4 AND 15')
        ]);

        res.render('historyFinance', {
            data: result.rows,
            role,
            optionWarehouseLocation: warehouses.rows,
            optionDivision: divisions.rows,
            currentPage: parseInt(page),
            totalPages,
            itemsPerPage: limit,
            searchKeyword: search.trim(),
            filterDateStart,
            filterDateEnd
        });
    } catch (err) {
        console.error('Error while fetching SO/DO:', err);
        res.status(500).send('Gagal mengambil data dari database');
    }
};

// export Data for scm
exports.exportCSV = async (req, res) => {
    const {
        search = '', filterDateStart = '', filterDateEnd = ''
    } = req.query;
    const searchPattern = `%${search.trim()}%`;
    const user = req.user;

    let filterConditions = [];
    let filterValues = [];

    if (search.trim()) {
        filterConditions.push(`(
                m.delivery_order_number ILIKE $${filterValues.length + 1} OR
                m.sales_order_number ILIKE $${filterValues.length + 1} OR
                m.customer_name ILIKE $${filterValues.length + 1} OR
                name_division ILIKE $${filterValues.length + 1} OR
                m.ship_by ILIKE $${filterValues.length + 1} OR
                m.ekspedisi_note ILIKE $${filterValues.length + 1} OR
                w.location_warehouse ILIKE $${filterValues.length + 1})`);
        filterValues.push(searchPattern);
    }

    if (filterDateStart && filterDateEnd) {
        filterConditions.push(`delivery_order_date BETWEEN $${filterValues.length + 1} AND $${filterValues.length + 2}`);
        filterValues.push(filterDateStart, filterDateEnd);
    }

    const whereClause = filterConditions.length > 0 ? `WHERE ${filterConditions.join(' AND ')}` : '';

    const query = `SELECT sales_order_number, delivery_order_number, delivery_order_date, 
                        customer_name, ship_by, ekspedisi_note, receive_name, eta, 
                        resi_number, name_division, location_warehouse
                    FROM monitoring_data m JOIN warehouse w ON m.warehouse_location = w.id_warehouse JOIN division d ON m.division_team = d.id_division ${whereClause} ORDER BY m.id_monitoring_data DESC`;

    try {
        const result = await pool.query(query, filterValues);
        const jsonData = result.rows;

        const fields = [
            'sales_order_number', 'delivery_order_number', 'delivery_order_date',
            'customer_name', 'ship_by', 'ekspedisi_note', 'receive_name',
            'eta', 'resi_number', 'name_division', 'location_warehouse'
        ];
        const formattedData = result.rows.map(row => {
            return {
                ...row,
                delivery_order_date: row.delivery_order_date?.toISOString().split('T')[0] || '',
                eta: row.eta?.toISOString().split('T')[0] || '',
            };
        });

        const parser = new Parser({
            fields
        });
        const csv = parser.parse(formattedData);
        await pool.query(`
            INSERT INTO log_monitoring_data 
            (user_id, name, role_name, delivery_order_number_inputed, inputed_at, keterangan) 
            VALUES ($1, $2, $3, 'Report Downloaded', NOW(), 'Export SO / DO CSV') 
            RETURNING *`,
            [user.user_id, user.name, user.role_name]
        );

        res.header('Content-Type', 'text/csv');
        res.attachment('so-do-export.csv');
        res.send(csv);
    } catch (err) {
        console.error('Gagal export CSV:', err);
        res.status(500).send('Gagal export CSV');
    }
};

// POST: Create SO/DO
exports.createSO = async (req, res) => {
    const {
        delivery_order_number
    } = req.body;
    const user = req.user;

    try {

        const doNumber = `DO-${delivery_order_number?.trim().replace(/\D/g, '')}`;
        const exists = await pool.query('SELECT COUNT(*) FROM monitoring_data WHERE delivery_order_number = $1', [doNumber]);
        if (parseInt(exists.rows[0].count)) {
            req.flash('errorMessage', `${doNumber} sudah ada di database.`);
            return res.redirect('/soDo');
        }

        const png = await bwipjs.toBuffer({
            bcid: 'code128',
            text: doNumber,
            scale: 3,
            height: 10,
            includetext: true
        });
        const barcodeBase64 = png.toString('base64');
        fs.writeFileSync(path.join(__dirname, '../../public/barcodes', `${doNumber}.png`), png);

        const insertQuery = `INSERT INTO monitoring_data (id_user_accounts, warehouse_location, division_team, sales_order_number, sales_order_date, delivery_order_number, delivery_order_date, status, ship_by, customer_name, ekspedisi_note, resi_number, weight, price, eta, receive_name, created_at, is_done, barcode_do) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,NOW(),$17,$18)`;
        const values = [
            user.user_id,
            req.body.warehouse_location,
            req.body.division_team,
            `SO-${req.body.sales_order_number?.trim().replace(/\D/g, '')}`,
            req.body.sales_order_date,
            doNumber,
            req.body.delivery_order_date,
            'Draft',
            req.body.ship_by,
            req.body.customer_name,
            req.body.ekspedisi_note,
            req.body.resi_number,
            req.body.weight || null,
            req.body.price || null,
            req.body.eta || null,
            req.body.receive_name,
            false,
            barcodeBase64
        ];

        await pool.query(insertQuery, values);
        await pool.query(`INSERT INTO log_monitoring_data (user_id, name, role_name, delivery_order_number_inputed, inputed_at, keterangan) VALUES ($1, $2, $3, $4, NOW(), 'Created SO / DO')`, [user.user_id, user.name, user.role_name, doNumber]);

        req.flash('successMessage', 'SO / DO berhasil dibuat');
        res.redirect('/soDo');
    } catch (err) {
        console.error('Create SO/DO failed:', err);
        console.log('Create SO/DO failed:', err);
        req.flash('errorMessage', 'Gagal membuat SO/DO');
        res.redirect('/soDo');
    }
};

// POST: Update SO/DO
exports.updateSO = async (req, res) => {
    const {
        id_monitoring_data
    } = req.params;
    const user = req.user;

    // Destructure dan normalisasi nilai dari req.body
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
        receive_name,
        invoicing_date
    } = req.body;

    // Konversi nilai kosong menjadi null jika perlu
    weight = weight?.trim() === '' ? null : weight;
    price = price?.trim() === '' ? null : price;
    eta = eta?.trim() === '' ? null : eta;
    invoicing_date = invoicing_date?.trim() === '' ? null : invoicing_date;

    try {
        // ✅ Generate barcode dari delivery_order_number baru
        const png = await bwipjs.toBuffer({
            bcid: 'code128',
            text: delivery_order_number,
            scale: 3,
            height: 10,
            includetext: true
        });

        const barcodeBase64 = png.toString('base64');
        fs.writeFileSync(path.join(__dirname, '../../public/barcodes', `${delivery_order_number}.png`), png);

        const updateQuery = `
        UPDATE monitoring_data SET
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
            barcode_do = $16,
            update_at = NOW()
        WHERE id_monitoring_data = $17
    `;

        const values = [
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
            barcodeBase64,
            id_monitoring_data
        ];

        await pool.query(updateQuery, values);

        // Logging ke log_monitoring_data
        await pool.query(
            `INSERT INTO log_monitoring_data
            (user_id, name, role_name, delivery_order_number_inputed, inputed_at, keterangan)
            VALUES ($1, $2, $3, $4, NOW(), 'Updated SO / DO')`,
            [user.user_id, user.name, user.role_name, delivery_order_number]
        );

        req.flash('successMessage', 'SO / DO berhasil diperbarui');
        res.redirect('/soDo');

    } catch (err) {
        console.error('Update SO/DO failed:', err);
        console.log('Update SO/DO failed:', err);
        req.flash('errorMessage', 'Gagal memperbarui SO/DO');
        res.redirect('/soDo');
    }
};

// POST: cancel atau delete SO/DO
exports.cancelDelete = async (req, res) => {
    const {
        id_monitoring_data
    } = req.params;
    const user = req.user;

    try {
        getCancelData = await pool.query(
            `SELECT * FROM monitoring_data WHERE id_monitoring_data = $1`,
            [id_monitoring_data]
        );

        if (getCancelData.rowCount === 0) {
            req.flash('errorMessage', 'Data SO/DO tidak ditemukan');
            return res.redirect('/soDo');
        }

        const result = getCancelData.rows[0];
        const sales_order_number = `${result.sales_order_number}-Cancel/Deleted`;
        const delivery_order_number = `${result.delivery_order_number}-Cancel/Deleted`;

        const updateQuery = `
            UPDATE monitoring_data SET
                sales_order_number = $1,
                delivery_order_number = $2,
                status = 'Cancel / Deleted',
                resi_number = null,
                ekspedisi_note = 'Cancel / Deleted by Request',
                invoicing_date = null,
                receive_name = null,
                eta = null,
                price = null,
                ship_by = null,
                update_at = NOW()
            WHERE id_monitoring_data = $3
        `;

        const values = [
            sales_order_number,
            delivery_order_number,
            id_monitoring_data
        ];

        await pool.query(updateQuery, values);

        // Logging ke log_monitoring_data
        await pool.query(
            `INSERT INTO log_monitoring_data
            (user_id, name, role_name, delivery_order_number_inputed, inputed_at, keterangan)
            VALUES ($1, $2, $3, $4, NOW(), 'Cancel / Delete SO / DO')`,
            [user.user_id, user.name, user.role_name, delivery_order_number]
        );

        req.flash('successMessage', 'SO / DO berhasil di Cancel atau Delete');
        res.redirect('/soDo');

    } catch (err) {
        console.error('Cancel atau Delete SO/DO failed:', err);
        req.flash('errorMessage', 'Gagal Cancel atau Delete SO/DO');
        res.redirect('/soDo');
    }
};

// routes/monitoring/soDo.controller.js
exports.updateInvoicingDate = async (req, res) => {
    const {
        id
    } = req.params;
    const user = req.session.user;

    try {
        const result = await pool.query(
            `SELECT delivery_order_number FROM monitoring_data WHERE id_monitoring_data = $1`,
            [id]
        );
        const delivery_order_number = result.rows[0]?.delivery_order_number;

        if (!delivery_order_number) {
            return res.status(404).json({
                success: false,
                error: 'DO tidak ditemukan'
            });
        }

        // Update invoicing_date
        await pool.query(`
            UPDATE monitoring_data
            SET invoicing_date = NOW(), update_at = NOW()
            WHERE id_monitoring_data = $1
            `,
            [id]);

        // Simpan log
        await pool.query(
            `INSERT INTO log_monitoring_data
            (user_id, name, role_name, delivery_order_number_inputed, inputed_at, keterangan)
            VALUES ($1, $2, $3, $4, NOW(), 'Export Invoice PDF')`,
            [user.user_id, user.name, user.role_name, delivery_order_number]
        );

        res.json({
            success: true,
            message: 'Export PDF berhasil & status invoicing diperbarui.'
        });
    } catch (err) {
        console.error('Gagal update invoicing_date:', err);
        res.status(500).json({
            success: false,
            error: 'Gagal update invoicing_date'
        });
    }
};


// POST: Upload CSV
exports.uploadSO = async (req, res) => {
    const user = req.user;
    const filePath = path.join(__dirname, '../../', req.file?.path);

    const results = [];
    let inserted = 0;
    let skipped = 0;

    try {
        await new Promise((resolve, reject) => {
            fs.createReadStream(filePath)
                .pipe(csv())
                .on('data', (data) => results.push(data))
                .on('end', resolve)
                .on('error', reject);
        });
        if (!req.file) {
            req.flash('errorMessage', 'File tidak ditemukan atau gagal diupload.');
            return res.redirect('/upload');
        }
        for (const row of results) {
            try {
                const doNumber = `DO-${row.delivery_order_number?.trim().replace(/\D/g, '')}`;
                if (!row.delivery_order_number || doNumber === 'DO-') continue;

                const exists = await pool.query('SELECT COUNT(*) FROM monitoring_data WHERE delivery_order_number = $1', [doNumber]);
                if (parseInt(exists.rows[0].count)) {
                    skipped++;
                    continue;
                }

                const png = await bwipjs.toBuffer({
                    bcid: 'code128',
                    text: doNumber,
                    scale: 3,
                    height: 10,
                    includetext: true
                });
                const barcodeBase64 = png.toString('base64');
                fs.writeFileSync(path.join(__dirname, '../../public/barcodes', `${doNumber}.png`), png);

                await pool.query(`INSERT INTO monitoring_data (id_user_accounts, warehouse_location, division_team, sales_order_number, sales_order_date, delivery_order_number, delivery_order_date, status, ship_by, customer_name, ekspedisi_note, resi_number, weight, price, eta, receive_name, created_at, is_done, barcode_do, picked_date, picked_by, packed_date, packed_by, shipped_date, shipped_by, invoicing_date) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,NOW(),$17,$18,$19,$20,$21,$22,$23,$24,$25)`, [
                    user.user_id,
                    row.warehouse_location,
                    row.division_team,
                    `SO-${row.sales_order_number?.trim().replace(/\D/g, '')}`,
                    row.sales_order_date,
                    doNumber,
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
                    barcodeBase64,
                    row.picked_date,
                    row.picked_by,
                    row.packed_date,
                    row.packed_by,
                    row.shipped_date,
                    row.shipped_by,
                    row.invoicing_date
                ]);

                inserted++;
            } catch (err) {
                console.error(`Insert failed for DO ${row.delivery_order_number}:`, err.message);
            }
        }

        req.flash('successMessage', `Upload selesai. ${inserted} data ditambahkan, ${skipped} dilewati.`);
    } catch (err) {
        console.error('Upload error:', err);
        req.flash('errorMessage', 'Terjadi kesalahan saat memproses file.');
    } finally {
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        res.redirect('/upload');
    }
};