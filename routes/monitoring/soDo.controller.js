const pool = require('../../db');
const bwipjs = require('bwip-js');
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const {
    Parser
} = require('json2csv');
const {
    v4: uuidv4
} = require('uuid');
const {
    generateEwarrantyToken
} = require('../../utils/jwt');
const {
    nanoid
} = require('nanoid');
const PDFDocument = require('pdfkit');
const BASE_URL = process.env.BASE_URL || 'http://localhost:3002';

function toProperCase(str) {
    if (!str) return '';
    return str
        .toLowerCase()
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}

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
            filterConditions.push(`m.division_team <> 3`);
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

        const dataQuery = `
            SELECT 
                m.id_monitoring_data AS export_id,
                m.sales_order_number, 
                m.delivery_order_number, 
                m.delivery_order_date, 
                m.status, 
                m.ship_by, 
                m.customer_name,
                m.invoicing_date, 
                m.barcode_do, 
                m.order_number, 
                m.order_from, 
                m.receive_name, 
                m.eta,
                d.name_division, 
                w.location_warehouse,
                mel.unclaimed_count,

                -- pakai JSON_AGG biar bisa ambil banyak kolom detail
                COALESCE(
                    json_agg(
                        json_build_object(
                            'id_detail', dmd.id_detail_monitoring_data,
                            'no_catalog', dmd.no_catalog,
                            'serial_number', dmd.serial_number
                        )
                    ) FILTER (WHERE dmd.id_detail_monitoring_data IS NOT NULL),
                    '[]'
                ) AS detail_items

            FROM monitoring_data m
            LEFT JOIN warehouse w 
                ON m.warehouse_location = w.id_warehouse 
            LEFT JOIN division d 
                ON m.division_team = d.id_division
            LEFT JOIN detail_monitoring_data dmd 
                ON m.id_monitoring_data = dmd.id_monitoring_data
            LEFT JOIN (
                SELECT id_monitoring_data,
                    COUNT(*) FILTER (WHERE is_claimed = false) AS unclaimed_count
                FROM monitoring_e_warranty_links
                GROUP BY id_monitoring_data
            ) mel ON m.id_monitoring_data = mel.id_monitoring_data
            ${whereClause}
            GROUP BY 
                m.id_monitoring_data, 
                m.sales_order_number, 
                m.delivery_order_number, 
                m.delivery_order_date, 
                m.status, 
                m.ship_by, 
                m.customer_name,
                m.invoicing_date, 
                m.barcode_do, 
                m.order_number, 
                m.order_from, 
                m.receive_name, 
                m.eta,
                d.name_division, 
                w.location_warehouse, 
                mel.unclaimed_count
            ORDER BY m.id_monitoring_data DESC 
            LIMIT $${filterValues.length + 1} 
            OFFSET $${filterValues.length + 2};
        `;

        const dataValues = [...filterValues, limit, offset];
        const result = await pool.query(dataQuery, dataValues);

        const [warehouses, divisions] = await Promise.all([
            pool.query('SELECT id_warehouse, location_warehouse FROM warehouse'),
            pool.query('SELECT id_division, name_division FROM division WHERE id_division BETWEEN 3 AND 15')
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
        const [itemResult, warehouses, divisions, detailItems, ewarrantyLinks] = await Promise.all([
            pool.query('SELECT * FROM monitoring_data JOIN warehouse ON monitoring_data.warehouse_location = warehouse.id_warehouse JOIN division ON monitoring_data.division_team = division.id_division WHERE id_monitoring_data = $1', [id]),
            pool.query('SELECT id_warehouse, location_warehouse FROM warehouse'),
            pool.query('SELECT id_division, name_division FROM division'),
            pool.query(`SELECT dmd.*, COALESCE(SUM(CASE WHEN mel.is_claimed = true THEN 1 ELSE 0 END),0) AS claimed_count
                        FROM detail_monitoring_data dmd
                        LEFT JOIN monitoring_e_warranty_links mel
                        ON dmd.id_monitoring_data = mel.id_monitoring_data
                        AND dmd.id_detail_monitoring_data = mel.id_detail_monitoring_data
                        WHERE dmd.id_monitoring_data = $1
                        GROUP BY dmd.id_detail_monitoring_data`, [id]),
            pool.query('SELECT * FROM monitoring_e_warranty_links WHERE id_monitoring_data = $1', [id])
        ]);

        if (!itemResult.rows.length) return res.status(404).send('Data tidak ditemukan');

        res.render('soDoEdit', {
            item: itemResult.rows[0],
            role: req.user?.role,
            optionWarehouseLocation: warehouses.rows,
            optionDivision: divisions.rows,
            ewarrantyLink: ewarrantyLinks.rows,
            details: detailItems.rows
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
        const [itemResult, warehouses, divisions, detailItems, ewarrantyLinks] = await Promise.all([
            pool.query('SELECT * FROM monitoring_data JOIN warehouse ON monitoring_data.warehouse_location = warehouse.id_warehouse JOIN division ON monitoring_data.division_team = division.id_division WHERE id_monitoring_data = $1', [id]),
            pool.query('SELECT id_warehouse, location_warehouse FROM warehouse'),
            pool.query('SELECT id_division, name_division FROM division'),
            pool.query(`SELECT dmd.*, COALESCE(SUM(CASE WHEN mel.is_claimed = true THEN 1 ELSE 0 END),0) AS claimed_count
                        FROM detail_monitoring_data dmd
                        LEFT JOIN monitoring_e_warranty_links mel
                        ON dmd.id_monitoring_data = mel.id_monitoring_data
                        AND dmd.id_detail_monitoring_data = mel.id_detail_monitoring_data
                        WHERE dmd.id_monitoring_data = $1
                        GROUP BY dmd.id_detail_monitoring_data`, [id]),
            pool.query('SELECT * FROM monitoring_e_warranty_links WHERE id_monitoring_data = $1', [id])
        ]);

        if (!itemResult.rows.length) return res.status(404).send('Data tidak ditemukan');

        res.render('soDoView', {
            item: itemResult.rows[0],
            userRole: req.user?.role,
            optionWarehouseLocation: warehouses.rows,
            optionDivision: divisions.rows,
            ewarrantyLink: ewarrantyLinks.rows,
            details: detailItems.rows
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Gagal mengambil data dari database');
    }
};

// GET: Upload Page
exports.getUploadPage = (req, res) => {
    try {
        res.render('uploadSoDo');
    } catch (err) {
        console.error(err);
        res.status(500).send('Gagal mengambil data dari database');
    }
};

// Ambil detail monitoring_data by ID
exports.getDetailMonitoring = async (req, res) => {
    try {
        const {
            id
        } = req.params;
        const query = `
      SELECT 
        m.id_monitoring_data,
        m.delivery_order_number,
        m.invoicing_date,
        m.customer_name,
        m.ship_by,
        m.eta,
        m.receive_name,
        m.price,
        m.resi_number,
        w.location_warehouse,
        d.id_detail_monitoring_data,
        d.no_catalog,
        d.serial_number,
        d.qty_product,
        d.product_name,
        d.keterangan
      FROM monitoring_data m
      LEFT JOIN warehouse w ON m.warehouse_location = w.id_warehouse
      LEFT JOIN detail_monitoring_data d ON m.id_monitoring_data = d.id_monitoring_data
      WHERE m.id_monitoring_data = $1 OR d.id_monitoring_data = $1;
    `;

        const result = await pool.query(query, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Data tidak ditemukan'
            });
        }

        res.json({
            success: true,
            data: result.rows
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({
            success: false,
            message: 'Server error'
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
// PRINT E WARRANTY BARCODE
exports.getBarcodeLink = async (req, res) => {
    const {
        id
    } = req.params;
    try {
        const result = await pool.query(
            `SELECT mel.uuid, dmd.no_catalog, dmd.serial_number
            FROM monitoring_e_warranty_links mel
            LEFT JOIN detail_monitoring_data dmd 
            ON mel.id_monitoring_data = dmd.id_monitoring_data 
            AND mel.no_catalog = dmd.no_catalog
            WHERE mel.id_monitoring_data = $1 AND mel.is_claimed = false `,
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                message: 'Not found'
            });
        }

        const data = result.rows.map(row => ({
            uuid: `${row.uuid}.png`,
            serial_number: row.serial_number,
            no_catalog: row.no_catalog
        }));
        res.json({
            data
        });

    } catch (err) {
        console.error('❌ Error fetching barcode link:', err);
        console.log("error ges", err);
        res.status(500).json({
            message: 'Server error'
        });
    }
};

// E WARRANTY BARCODE BY ID
exports.getManageEwarranty = async (req, res) => {
    const {
        id
    } = req.params; // id_monitoring_data

    try {
        const result = await pool.query(
            `SELECT m.delivery_order_number, 
                    mel.id_detail_monitoring_data, 
                    mel.id_monitoring_data, 
                    mel.uuid, 
                    dmd.no_catalog, 
                    dmd.serial_number, 
                    m.delivery_order_number, 
                    mel.expired_at,
                    mel.is_claimed
            FROM monitoring_e_warranty_links mel
            LEFT JOIN detail_monitoring_data dmd 
                ON mel.id_monitoring_data = dmd.id_monitoring_data 
                AND mel.no_catalog = dmd.no_catalog
            LEFT JOIN monitoring_data m 
                ON m.id_monitoring_data = mel.id_monitoring_data
            WHERE mel.id_detail_monitoring_data = $1
            ORDER BY dmd.no_catalog, dmd.serial_number`,
            [id]
        );

        // Group by no_catalog
        const grouped = {};
        result.rows.forEach(row => {
            if (!grouped[row.no_catalog]) {
                grouped[row.no_catalog] = {
                    no_catalog: row.no_catalog,
                    delivery_order_number: row.delivery_order_number,
                    barcodes: [],
                    qty_total: 0,
                    qty_claimed: 0,
                    qty_available: 0
                };
            }

            grouped[row.no_catalog].barcodes.push({
                uuid: row.uuid,
                serial_number: row.serial_number,
                expired_at: row.expired_at,
                is_claimed: row.is_claimed
            });

            // Hitung summary
            grouped[row.no_catalog].qty_total++;
            if (row.is_claimed) {
                grouped[row.no_catalog].qty_claimed++;
            } else {
                grouped[row.no_catalog].qty_available++;
            }
        });

        res.render("soDoBarcodes", {
            id_monitoring_data: id,
            summaryBarcodes: Object.values(grouped)
        });
    } catch (err) {
        console.error("❌ Error fetching e-warranty summary:", err);
        res.status(500).send("Server error");
    }
};

// controllers/soDo.controller.js
exports.getBarcodesByCatalog = async (req, res) => {
    const {
        id,
        catalog
    } = req.params; // id_monitoring_data & no_catalog
    const {
        draw,
        start,
        length,
        search,
        status
    } = req.query;

    try {
        // Base query
        let where = `mel.id_detail_monitoring_data = $1 AND dmd.no_catalog = $2`;
        const params = [id, catalog];
        let paramIndex = 3;

        // Filter by status (available/claimed)
        if (status === "available") {
            where += ` AND mel.is_claimed = false`;
        } else if (status === "claimed") {
            where += ` AND mel.is_claimed = true`;
        }

        // Search filter
        if (search && search.value) {
            where += ` AND dmd.serial_number ILIKE $${paramIndex}`;
            params.push(`%${search.value}%`);
            paramIndex++;
        }

        // Count total
        const totalRes = await pool.query(
            `SELECT COUNT(*) FROM monitoring_e_warranty_links mel
            JOIN detail_monitoring_data dmd
                ON mel.id_monitoring_data = dmd.id_monitoring_data
                AND mel.no_catalog = dmd.no_catalog
            WHERE mel.id_monitoring_data = $1 AND dmd.no_catalog = $2`,
            [id, catalog]
        );

        // Count filtered
        const filteredRes = await pool.query(
            `SELECT COUNT(*) FROM monitoring_e_warranty_links mel
            JOIN detail_monitoring_data dmd
                ON mel.id_monitoring_data = dmd.id_monitoring_data
                AND mel.no_catalog = dmd.no_catalog
            WHERE ${where}`,
            params
        );

        // Ambil data
        params.push(length, start);
        const dataRes = await pool.query(
            `SELECT mel.uuid, dmd.serial_number, mel.expired_at, mel.is_claimed
            FROM monitoring_e_warranty_links mel
            JOIN detail_monitoring_data dmd
                ON mel.id_monitoring_data = dmd.id_monitoring_data
                AND mel.no_catalog = dmd.no_catalog
            WHERE ${where}
            ORDER BY dmd.serial_number
            LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
            params
        );

        // Format untuk DataTables
        res.json({
            draw,
            recordsTotal: totalRes.rows[0].count,
            recordsFiltered: filteredRes.rows[0].count,
            data: dataRes.rows.map((row, i) => [
                parseInt(start) + i + 1,
                row.serial_number,
                row.expired_at ? new Date(row.expired_at).toLocaleDateString("id-ID") : "-",
                row.is_claimed ?
                `<span class="badge bg-secondary">Claimed</span>` :
                `<input type="checkbox" class="barcode-check" value="${row.uuid}" />`,
                `<button class="btn btn-sm btn-secondary btn-extend" 
                    data-uuid="${row.uuid}" 
                    ${row.is_claimed ? "disabled" : ""}>Extend</button>`
            ])
        });
    } catch (err) {
        console.error("❌ Error fetching barcodes by catalog:", err);
        res.status(500).json({
            error: "Server error"
        });
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
        console.log("Ini values ", values);

        await pool.query(insertQuery, values);
        // Ambil ID monitoring_data yang baru dibuat
        const monitoringResult = await pool.query(`SELECT id_monitoring_data FROM monitoring_data WHERE delivery_order_number = $1 LIMIT 1`, [doNumber]);
        const id_monitoring_data = monitoringResult.rows[0]?.id_monitoring_data;

        // Ambil data detail dari form
        const {
            detail_no_catalog,
            detail_serial_number,
            detail_product_name,
            detail_qty_product,
            detail_keterangan
        } = req.body;
        console.log("ini req body detail itemnya ", req.body);
        if (
            Array.isArray(detail_product_name) &&
            detail_product_name.length > 0
        ) {
            for (let i = 0; i < detail_product_name.length; i++) {
                const noCatalog = detail_no_catalog?.[i]?.trim() || null;
                const snProduct = detail_serial_number?.[i]?.trim() || null;
                const productName = detail_product_name?.[i] || null;
                const qty = parseInt(detail_qty_product?.[i] || "0", 10);
                const keterangan = detail_keterangan?.[i] || null;

                // Kalau dua-duanya kosong → stop + kirim error
                if (!noCatalog && !snProduct) {
                    req.flash('errorMessage', `Baris ke-${i + 1}: No Catalog atau Serial Number wajib diisi salah satu`);
                    return res.redirect('/soDo');
                }

                // Insert ke detail_monitoring_product
                const insertDetail = await pool.query(`
                    INSERT INTO detail_monitoring_data
                    (id_monitoring_data, no_catalog, product_name, qty_product, keterangan, created_at, serial_number) 
                    VALUES ($1, $2, $3, $4, $5, NOW(), $6)
                    RETURNING id_detail_monitoring_data
                `, [id_monitoring_data, noCatalog, productName, qty, keterangan, snProduct]);

                if (!insertDetail.rows || insertDetail.rows.length === 0) {
                    console.error("Insert detail_monitoring_data gagal, tidak ada row yang dikembalikan.");
                    req.flash('errorMessage', 'Gagal menyimpan detail SO/DO');
                    return res.redirect('/soDo');
                }

                const idDetailMonitoringData = insertDetail.rows[0].id_detail_monitoring_data;
                // Generate UUID + link + QR untuk setiap qty
                for (let j = 0; j < qty; j++) {
                    const uuid = uuidv4();
                    const shortId = nanoid(3); // lebih pendek dari UUID v4

                    // Gabungkan string mentah lalu encode base64url
                    const raw = `${noCatalog}:${doNumber}:${uuid}`;
                    const encoded = Buffer.from(raw).toString('base64url');

                    const token = generateEwarrantyToken(shortId);
                    const expiredAt = new Date(Date.now() + 40 * 24 * 60 * 60 * 1000); // 40 hari

                    // Final link dengan encoded gabungan
                    const finalLink = `${BASE_URL}/ewarranty/register/${token}/${encoded}`;
                    const shortLink = `${BASE_URL}/ewarranty/s/${shortId}`;

                    // Buat QR barcode (base64, tidak simpan ke file)
                    const qrBuffer = await bwipjs.toBuffer({
                        bcid: 'qrcode',
                        text: finalLink,
                        scale: 3
                    });

                    const filePath = path.join(__dirname, '../../public/barcodes', `${uuid}.png`);
                    fs.writeFileSync(filePath, qrBuffer);

                    // Simpan ke database
                    await pool.query(`
                        INSERT INTO monitoring_e_warranty_links 
                        (id_monitoring_data, no_catalog, uuid, jwt_token, barcode_link, created_at, expired_at, is_claimed, short_link, short_id, id_detail_monitoring_data) 
                        VALUES ($1, $2, $3, $4, $5, NOW(), $6, false, $7, $8, $9)
                    `, [id_monitoring_data, noCatalog, uuid, token, finalLink, expiredAt, shortLink, shortId, idDetailMonitoringData]);
                }
            }
        }
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
        invoicing_date,
        order_number,
        order_from
    } = req.body;

    const emptyToNull = (val) => val?.trim() === '' ? null : val;
    weight = emptyToNull(weight);
    price = emptyToNull(price);
    eta = emptyToNull(eta);
    invoicing_date = emptyToNull(invoicing_date);
    sales_order_date = emptyToNull(sales_order_date);
    delivery_order_date = emptyToNull(delivery_order_date);

    try {
        // 1️⃣ Cek duplikat delivery_order_number
        if (delivery_order_number && delivery_order_number.trim() !== '') {
            const dupDO = await pool.query(
                `SELECT 1 FROM monitoring_data 
                WHERE delivery_order_number = $1 
                AND id_monitoring_data <> $2`,
                [delivery_order_number, id_monitoring_data]
            );
            if (dupDO.rowCount > 0) {
                return res.redirect('/soDo?status=error&msg=' + encodeURIComponent('Delivery Order Number sudah digunakan!'));
            }
        }

        // 2️⃣ Cek duplikat order_number
        if (order_number && order_number.trim() !== '') {
            const dupON = await pool.query(
                `SELECT 1 FROM monitoring_data 
                WHERE order_number = $1 
                AND id_monitoring_data <> $2`,
                [order_number, id_monitoring_data]
            );
            if (dupON.rowCount > 0) {
                return res.redirect('/soDo?status=error&msg=' + encodeURIComponent('Order Number sudah digunakan!'));
            }
        }

        // 3️⃣ Generate barcode
        let barcodeBase64 = null;
        if (delivery_order_number) {
            const png = await bwipjs.toBuffer({
                bcid: 'code128',
                text: delivery_order_number,
                scale: 3,
                height: 10,
                includetext: true
            });

            barcodeBase64 = png.toString('base64');
            fs.writeFileSync(
                path.join(__dirname, '../../public/barcodes', `${delivery_order_number}.png`),
                png
            );
        }
        // 4️⃣ Update data
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
                order_number = $17,
                update_at = NOW(),
                order_from = $18
            WHERE id_monitoring_data = $19
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
            order_number,
            order_from,
            id_monitoring_data
        ];

        await pool.query(updateQuery, values);

        // 5️⃣ Log update
        const deliveryOrderForLog = (user.division_team === 3) ? order_number : delivery_order_number;
        await pool.query(`
            INSERT INTO log_monitoring_data
            (user_id, name, role_name, delivery_order_number_inputed, inputed_at, keterangan)
            VALUES ($1, $2, $3, $4, NOW(), 'Updated SO / DO')
        `, [
            user.user_id,
            user.name,
            user.role_name,
            deliveryOrderForLog
        ]);

        // 6️⃣ Update detail items dengan proteksi klaim + sinkronisasi warranty links
        const oldDetails = await pool.query(`
            SELECT dmd.id_detail_monitoring_data, dmd.no_catalog, dmd.serial_number, dmd.qty_product,
                    COALESCE(SUM(CASE WHEN mel.is_claimed=true THEN 1 ELSE 0 END),0) AS claimed_count
            FROM detail_monitoring_data dmd
            LEFT JOIN monitoring_e_warranty_links mel
                ON dmd.id_monitoring_data=mel.id_monitoring_data
            AND dmd.id_detail_monitoring_data=mel.id_detail_monitoring_data
            WHERE dmd.id_monitoring_data=$1
            GROUP BY dmd.id_detail_monitoring_data, dmd.no_catalog, dmd.serial_number, dmd.qty_product
        `, [id_monitoring_data]);

        const oldMap = {};
        oldDetails.rows.forEach(r => {
            oldMap[parseInt(r.id_detail_monitoring_data)] = r;
        });
        console.log('ini oldDetails', oldDetails.rows);
        const tempItems = JSON.parse(req.body.tempItems || "[]");
        console.log('ini tempItems', tempItems);

        // 6️⃣ Insert/Update detail
        for (const item of tempItems) {
            const newQty = parseInt(item.qty_product) || 0;
            let detailId = item.id_detail_monitoring_data ? parseInt(item.id_detail_monitoring_data) : null;

            if (detailId && oldMap[detailId]) {
                const old = oldMap[detailId];

                if (old.claimed_count >= old.qty_product) continue;
                if (newQty < old.claimed_count) {
                    return res.redirect('/soDo/edit/' + id_monitoring_data +
                        '?status=error&msg=' + encodeURIComponent(
                            `Qty untuk ${item.no_catalog || '(no catalog)'} tidak boleh lebih kecil dari ${old.claimed_count} (sudah klaim)`
                        )
                    );
                }

                // Update detail row
                await pool.query(`
                UPDATE detail_monitoring_data
                    SET qty_product=$1, product_name=$2, keterangan=$3, serial_number=$4, updated_at=NOW()
                WHERE id_detail_monitoring_data=$5
                `, [newQty, item.product_name, item.keterangan, item.serial_number, detailId]);

                // Adjust warranty links pakai diff
                const diff = newQty - old.qty_product;
                if (diff > 0) {
                    // Tambah diff rows baru
                    for (let i = 0; i < diff; i++) {
                        const uuid = uuidv4();
                        const shortId = nanoid(3);
                        const raw = `${item.no_catalog}:${delivery_order_number || order_number}:${uuid}`;
                        const encoded = Buffer.from(raw).toString('base64url');
                        const token = generateEwarrantyToken(shortId);
                        const expiredAt = new Date(Date.now() + 40 * 24 * 60 * 60 * 1000);

                        const finalLink = `${BASE_URL}/ewarranty/register/${token}/${encoded}`;
                        const shortLink = `${BASE_URL}/ewarranty/s/${shortId}`;
                        const qrBuffer = await bwipjs.toBuffer({
                            bcid: 'qrcode',
                            text: finalLink,
                            scale: 3
                        });
                        fs.writeFileSync(path.join(__dirname, '../../public/barcodes', `${uuid}.png`), qrBuffer);

                        await pool.query(`
                    INSERT INTO monitoring_e_warranty_links
                    (id_monitoring_data,id_detail_monitoring_data,no_catalog,uuid,jwt_token,barcode_link,created_at,expired_at,is_claimed,short_link,short_id)
                    VALUES ($1,$2,$3,$4,$5,$6,NOW(),$7,false,$8,$9)
                    `, [
                            id_monitoring_data,
                            detailId,
                            item.no_catalog,
                            uuid,
                            token,
                            finalLink,
                            expiredAt,
                            shortLink,
                            shortId
                        ]);
                    }
                } else if (diff < 0) {
                    // Kurangi link false
                    await pool.query(`
                DELETE FROM monitoring_e_warranty_links
                WHERE ctid IN (
                SELECT ctid FROM monitoring_e_warranty_links
                WHERE id_monitoring_data=$1 
                    AND id_detail_monitoring_data=$2
                    AND is_claimed=false
                LIMIT $3
                )
            `, [id_monitoring_data, detailId, -diff]);
                }

            } else {
                // Insert detail baru
                const ins = await pool.query(`
                    INSERT INTO detail_monitoring_data
                    (id_monitoring_data,no_catalog,serial_number,product_name,qty_product,keterangan,created_at)
                    VALUES ($1,$2,$3,$4,$5,$6,NOW())
                    RETURNING id_detail_monitoring_data
                `, [id_monitoring_data, item.no_catalog, item.serial_number, item.product_name, newQty, item.keterangan]);

                detailId = ins.rows[0].id_detail_monitoring_data
                item.id_detail_monitoring_data = detailId

                for (let i = 0; i < newQty; i++) {
                    const uuid = uuidv4();
                    const shortId = nanoid(3);
                    const raw = `${item.no_catalog}:${delivery_order_number || order_number}:${uuid}`;
                    const encoded = Buffer.from(raw).toString('base64url');
                    const token = generateEwarrantyToken(shortId);
                    const expiredAt = new Date(Date.now() + 40 * 24 * 60 * 60 * 1000);

                    const finalLink = `${BASE_URL}/ewarranty/register/${token}/${encoded}`;
                    const shortLink = `${BASE_URL}/ewarranty/s/${shortId}`;
                    const qrBuffer = await bwipjs.toBuffer({
                        bcid: 'qrcode',
                        text: finalLink,
                        scale: 3
                    });
                    fs.writeFileSync(path.join(__dirname, '../../public/barcodes', `${uuid}.png`), qrBuffer);

                    await pool.query(`
                    INSERT INTO monitoring_e_warranty_links
                    (id_monitoring_data,id_detail_monitoring_data,no_catalog,uuid,jwt_token,barcode_link,created_at,expired_at,is_claimed,short_link,short_id)
                    VALUES ($1,$2,$3,$4,$5,$6,NOW(),$7,false,$8,$9)
                    `, [
                        id_monitoring_data,
                        detailId,
                        item.no_catalog,
                        uuid,
                        token,
                        finalLink,
                        expiredAt,
                        shortLink,
                        shortId
                    ]);
                }
            }
        }

        // 7️⃣ Handle detail yang dihapus (poin e)
        const newIds = tempItems.map(i => parseInt(i.id_detail_monitoring_data)).filter(Boolean);
        for (const oldest of oldDetails.rows) {
            const oldId = parseInt(oldest.id_detail_monitoring_data);
            if (!newIds.includes(oldId)) {
                const claimedCount = parseInt(oldest.claimed_count || 0);
                if (claimedCount > 0) {
                    // Ada klaim → turunkan qty ke jumlah klaim, hapus links false
                    await pool.query(`
                    UPDATE detail_monitoring_data
                    SET qty_product=$1, updated_at=NOW()
                    WHERE id_detail_monitoring_data=$2
                `, [claimedCount, oldId]);

                    await pool.query(`
                    DELETE FROM monitoring_e_warranty_links
                    WHERE id_monitoring_data=$1
                    AND id_detail_monitoring_data=$2
                    AND is_claimed=false
                `, [id_monitoring_data, oldId]);

                    console.log(`♻️ Detail ${oldId} disesuaikan ke qty=${claimedCount}, links false dihapus`);
                } else {
                    // Tidak ada klaim → hapus detail & links false
                    await pool.query(`
                    DELETE FROM monitoring_e_warranty_links
                    WHERE id_monitoring_data=$1
                    AND id_detail_monitoring_data=$2
                    AND is_claimed=false
                `, [id_monitoring_data, oldId]);

                    await pool.query(
                        `DELETE FROM detail_monitoring_data WHERE id_detail_monitoring_data=$1`,
                        [oldId]
                    );

                    console.log(`🗑️ Detail ${oldId} dihapus total karena tidak ada klaim`);
                }
            }
        }

        // ✅ Success
        res.redirect('/soDo?status=success&msg=' +
            encodeURIComponent('SO / DO berhasil diperbarui'));
    } catch (err) {
        console.error('Update SO/DO failed:', err);
        res.redirect('/soDo?status=error&msg=' +
            encodeURIComponent('Gagal memperbarui SO/DO'));
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
    const user = req.user;
    console.log("🔥 [invoice-export] ID diterima:", id);

    try {
        const result = await pool.query(
            `SELECT delivery_order_number, order_number FROM monitoring_data WHERE id_monitoring_data = $1`,
            [id]
        );
        const delivery_order_number = result.rows[0]?.delivery_order_number;
        const order_number = result.rows[0]?.order_number;
        console.log("Hasil query exportInvoice:", result.rows);
        if (!delivery_order_number && !order_number) {
            return res.status(404).json({
                success: false,
                error: 'DO / Order Number tidak ditemukan'
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
    let addedItems = 0;
    let skipped = 0;

    // Fungsi untuk parsing tanggal Indonesia → YYYY-MM-DD
    function parseIndonesianDate(str) {
        if (!str) return null;
        const bulanMap = {
            'januari': '01',
            'februari': '02',
            'maret': '03',
            'april': '04',
            'mei': '05',
            'juni': '06',
            'juli': '07',
            'agustus': '08',
            'september': '09',
            'oktober': '10',
            'november': '11',
            'desember': '12'
        };
        const parts = str.toLowerCase().trim().split(' ');
        if (parts.length !== 3) return null;

        let [day, monthName, year] = parts;
        const month = bulanMap[monthName];
        if (!month) return null;

        return `${year}-${month}-${day.padStart(2, '0')}`;
    }

    try {
        if (!req.file) {
            req.flash('errorMessage', 'File tidak ditemukan atau gagal diupload.');
            return res.redirect('/upload');
        }

        // Deteksi delimiter
        const firstLine = fs.readFileSync(filePath, 'utf8').split('\n')[0];
        const delimiter = firstLine.includes(';') ? ';' : ',';

        // Baca CSV
        await new Promise((resolve, reject) => {
            fs.createReadStream(filePath)
                .pipe(csv({
                    separator: delimiter,
                    mapHeaders: ({
                        header
                    }) => header.trim().toLowerCase().replace(/\s+/g, '_'),
                    mapValues: ({
                        value
                    }) => value ? value.trim() : null
                }))
                .on('data', (data) => results.push(data))
                .on('end', resolve)
                .on('error', reject);
        });

        for (const row of results) {
            try {
                const namaBuyerFormatted = toProperCase(row.nama_buyer);
                const platformFormatted = toProperCase(row.platform);
                // Ambil value dengan beberapa kemungkinan nama kolom
                const orderNumber = row.order_number || row.no_pesanan || row['no_pesanan'] || row['no pesanan'] || null;

                // Cek kalau kosong
                if (!orderNumber) {
                    skipped++;
                    console.log(`⚠️ Skip: Kolom order_number kosong →`, row);
                    continue;
                }

                // Cek apakah header sudah ada
                const headerRes = await pool.query(
                    'SELECT id_monitoring_data FROM monitoring_data WHERE order_number = $1',
                    [orderNumber]
                );

                let id_monitoring_data;
                if (headerRes.rowCount > 0) {
                    // Kalau sudah ada → langsung tambahkan item
                    id_monitoring_data = headerRes.rows[0].id_monitoring_data;
                    console.log(`ℹ️ Header sudah ada, tambah item → ${orderNumber}`);
                } else {
                    // Insert header baru
                    const eta = parseIndonesianDate(row.purchase_date || row.tanggal_pesanan);
                    const monitoringRes = await pool.query(`
                        INSERT INTO monitoring_data 
                            (id_user_accounts, order_number, resi_number, customer_name, receive_name, eta, ship_by, ekspedisi_note, created_at, division_team, warehouse_location, status, is_done, picked_by, picked_date, packed_by, packed_date, order_from) 
                        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW(),3,17, 'Packed', false, $9,NOW(),$10,NOW(),$11)
                        RETURNING id_monitoring_data
                    `, [
                        user.user_id,
                        orderNumber,
                        row.resi_number,
                        namaBuyerFormatted,
                        namaBuyerFormatted,
                        eta,
                        row.ekspedisi,
                        row.ekspedisi,
                        user.user_id,
                        user.user_id,
                        platformFormatted
                    ]);
                    id_monitoring_data = monitoringRes.rows[0].id_monitoring_data;
                    inserted++;
                    console.log(`✅ Header baru ditambahkan → ${orderNumber}`);
                }

                // Insert detail item (dengan cek duplikat)
                const noCatalog = row.katalog || row.no_katalog || '';
                const serialNumber = row.serial_number || row.no_serial || ''; // tambahkan serial_number
                const productName = row.item || row.nama_produk || '';
                const qty = parseInt(row.qty) || 0;

                // ✅ Cek duplikat di detail_monitoring_data
                const dupDetail = await pool.query(`
                    SELECT 1 
                    FROM detail_monitoring_data
                    WHERE id_monitoring_data = $1
                    AND COALESCE(no_catalog, '') = COALESCE($2, '')
                    AND COALESCE(serial_number, '') = COALESCE($3, '')
                `, [id_monitoring_data, noCatalog, serialNumber]);

                if (dupDetail.rowCount > 0) {
                    console.log(`⚠️ Skip insert detail: ${noCatalog || '-'} / ${serialNumber || '-'} sudah ada`);
                } else {
                    await pool.query(`
                        INSERT INTO detail_monitoring_data
                            (id_monitoring_data, no_catalog, serial_number, product_name, qty_product, created_at) 
                        VALUES ($1,$2,$3,$4,$5,NOW())
                    `, [id_monitoring_data, noCatalog, serialNumber, productName, qty]);
                    addedItems++;

                    // Insert e-warranty per qty (hanya kalau belum ada semua)
                    for (let j = 0; j < qty; j++) {
                        const uuid = uuidv4();
                        const shortId = nanoid(3);
                        const raw = `${noCatalog}:${orderNumber}:${uuid}`;
                        const encoded = Buffer.from(raw).toString('base64url');
                        const token = generateEwarrantyToken(shortId);
                        const expiredAt = new Date(Date.now() + 40 * 24 * 60 * 60 * 1000);
                        const finalLink = `${BASE_URL}/ewarranty/register/${token}/${encoded}`;
                        const shortLink = `${BASE_URL}/ewarranty/s/${shortId}`;

                        const qrBuffer = await bwipjs.toBuffer({
                            bcid: 'qrcode',
                            text: finalLink,
                            scale: 3
                        });
                        fs.writeFileSync(path.join(__dirname, '../../public/barcodes', `${uuid}.png`), qrBuffer);

                        await pool.query(`
                            INSERT INTO monitoring_e_warranty_links 
                                (id_monitoring_data, no_catalog, uuid, jwt_token, barcode_link, created_at, expired_at, is_claimed, short_link, short_id) 
                            VALUES ($1,$2,$3,$4,$5,NOW(),$6,false,$7,$8)
                        `, [id_monitoring_data, noCatalog, uuid, token, finalLink, expiredAt, shortLink, shortId]);
                    }
                }

                // Log aktivitas
                await pool.query(`
                    INSERT INTO log_monitoring_data 
                        (user_id, name, role_name, delivery_order_number_inputed, inputed_at, keterangan) 
                    VALUES ($1,$2,$3,$4,NOW(),'Upload SO/DO')
                `, [user.user_id, user.name, user.role_name, orderNumber]);

            } catch (err) {
                console.error(`❌ Gagal proses row:`, err.message);
            }
        }

        req.flash('successMessage', `Upload selesai. Header baru: ${inserted}, Tambah item: ${addedItems}, Skipped: ${skipped}`);
    } catch (err) {
        console.error('Upload error:', err);
        req.flash('errorMessage', 'Terjadi kesalahan saat memproses file.');
    } finally {
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        res.redirect('/upload');
    }
};

exports.extendEwarrantyLink = async (req, res) => {
    const {
        id
    } = req.params;

    try {
        // Ambil semua data berdasarkan id_monitoring_data
        const result = await pool.query(`
            SELECT * FROM monitoring_e_warranty_links mel JOIN monitoring_data m ON mel.id_monitoring_data = m.id_monitoring_data   
            WHERE mel.id_monitoring_data = $1 AND is_claimed = false
        `, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({
                message: 'No links found'
            });
        }

        const newLinks = [];

        for (const row of result.rows) {
            const newUUID = uuidv4();
            const shortId = nanoid(3); // lebih pendek dari UUID v4
            const token = generateEwarrantyToken(shortId, '40d');

            const raw = `${row.no_catalog}:${row.delivery_order_number || ''}:${newUUID}`;
            const encoded = Buffer.from(raw).toString('base64url');

            const finalLink = `${BASE_URL}/ewarranty/register/${token}/${encoded}`;
            const shortLink = `${BASE_URL}/ewarranty/s/${shortId}`;
            const expiredDate = new Date(Date.now() + 40 * 24 * 60 * 60 * 1000);

            // Buat QR code
            const qrBuffer = await bwipjs.toBuffer({
                bcid: 'qrcode',
                text: finalLink,
                scale: 3
            });

            const filePath = path.join(__dirname, '../../public/barcodes', `${newUUID}.png`);
            fs.writeFileSync(filePath, qrBuffer);

            await pool.query(`
                UPDATE monitoring_e_warranty_links 
                SET uuid = $1,
                    jwt_token = $2,
                    barcode_link = $3,
                    updated_at = NOW(),
                    expired_at = $4,
                    short_link = $5,
                    short_id = $6
                WHERE id_monitoring_data = $7 AND uuid = $8
            `, [
                newUUID,
                token,
                finalLink,
                expiredDate,
                shortLink,
                shortId,
                id,
                row.uuid
            ]);

            newLinks.push({
                finalLink,
                shortLink
            });
        }

        res.json({
            message: 'Links extended and barcode regenerated successfully',
            data: newLinks
        });

    } catch (err) {
        console.error('❌ Error extending link:', err);
        res.status(500).json({
            message: 'Internal server error'
        });
    }
};

// POST: Extend expired_at +40 hari dan cetak PDF barcodes (format kecil 50x70mm)
exports.extendAndPrintBarcode = async (req, res) => {
    const {
        uuids
    } = req.body;
    const user = req.user;

    if (!uuids || uuids.length === 0) {
        return res.status(400).json({
            message: "UUID tidak ditemukan"
        });
    }

    try {
        // 1. Extend expired_at +40 hari
        const expiredAt = new Date(Date.now() + 40 * 24 * 60 * 60 * 1000);
        await pool.query(
            `UPDATE monitoring_e_warranty_links
             SET expired_at = $1, updated_at = NOW()
             WHERE uuid = ANY($2::text[])`,
            [expiredAt, uuids]
        );

        // 2. Ambil data barcode
        const result = await pool.query(
            `SELECT mel.uuid, dmd.serial_number, dmd.no_catalog
             FROM monitoring_e_warranty_links mel
             JOIN detail_monitoring_data dmd
               ON mel.id_monitoring_data = dmd.id_monitoring_data
              AND mel.no_catalog = dmd.no_catalog
             WHERE uuid = ANY($1::text[])`,
            [uuids]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                message: "Data barcode tidak ditemukan"
            });
        }

        // 3. Generate PDF (50x70 mm = 50*2.83465 pt x 70*2.83465 pt)
        const PDFDocument = require("pdfkit");
        const docWidth = 50 * 2.83465;
        const docHeight = 70 * 2.83465;

        const doc = new PDFDocument({
            autoFirstPage: false
        });

        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", "inline; filename=barcodes.pdf");
        doc.pipe(res);

        for (const item of result.rows) {
            const imgPath = path.join(__dirname, "../../public/barcodes", `${item.uuid}.png`);
            const label = item.serial_number?.trim() || item.no_catalog?.trim() || "-";

            doc.addPage({
                size: [docWidth, docHeight],
                margin: 10
            });

            let y = 15;

            // Header (gunakan width & align center, bukan x = centerX)
            doc.font("Helvetica-Bold").fontSize(9)
                .text("SCAN ME FOR", 0, y, {
                    width: docWidth,
                    align: "center"
                });
            doc.text("REGISTER E-WARRANTY", 0, y + 12, {
                width: docWidth,
                align: "center"
            });

            // Barcode
            if (fs.existsSync(imgPath)) {
                const barcodeWidth = 120;
                const barcodeHeight = 120;
                const barcodeX = (docWidth - barcodeWidth) / 2;
                const barcodeY = y + 24;
                doc.image(imgPath, barcodeX, barcodeY, {
                    width: barcodeWidth,
                    height: barcodeHeight
                });

                // Label
                const bottomTextY = barcodeY + barcodeHeight + 10;
                doc.font("Helvetica-Bold").fontSize(8)
                    .text(label, 0, bottomTextY, {
                        width: docWidth,
                        align: "center"
                    });

                // Garansi
                doc.font("Helvetica").fontSize(7)
                    .text("Garansi hanya berlaku 1 Tahun.", 0, bottomTextY + 7, {
                        width: docWidth,
                        align: "center"
                    });
            }
        }

        doc.end();
    } catch (err) {
        console.error("❌ Error extend+print barcode:", err);
        res.status(500).json({
            message: "Server error"
        });
    }
};