const pool = require('../../db');
require('dotenv').config();
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const {
    generateEwarrantyToken,
    verifyToken
} = require('../../utils/jwt');

const crypto = require('crypto');
const puppeteer = require('puppeteer');
const ejs = require('ejs');
const {
    generatePdfAndSendEmail
} = require('../../utils/ewarrantyPdfWorker');

// Konfigurasi penyimpanan file upload
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadPath = path.join(__dirname, "../../public/uploads/ewarranty");
        if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, {
                recursive: true
            });
        }
        cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
        const timestamp = Date.now();
        const ext = path.extname(file.originalname);
        cb(null, `warranty_${timestamp}${ext}`);
    },
});

// Helper async: convert image file to base64
const toBase64 = (filePath) => {
    return fs.readFileSync(filePath, {
        encoding: 'base64'
    });
};

const upload = multer({
    storage,
    limits: {
        fileSize: 10 * 1024 * 1024
    }, // Maksimal 10MB
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|pdf/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);

        if (mimetype && extname) {
            cb(null, true);
        } else {
            cb(new Error("Only .jpg, .jpeg, .png, or .pdf files are allowed."));
        }
    },
}).single("attachment");


const renderSwal = (title, text, icon = 'error') => {
    return `
    <html>
        <head>
            <script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>
        </head>
        <body>
            <script>
            Swal.fire({
                title: "${title}",
                text: "${text}",
                icon: "${icon}"
            }).then(() => {
                window.close();
            });
            </script>
        </body>
        </html>
    `;
};

exports.getCertificateListPage = async (req, res) => {
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

        if (search.trim()) {
            filterConditions.push(`(e.ewarranty_code ILIKE $${filterValues.length + 1} OR e.customer_company ILIKE $${filterValues.length + 1} OR e.customer_name ILIKE $${filterValues.length + 1})`);
            filterValues.push(searchPattern);
        }

        if (filterDateStart && filterDateEnd) {
            filterConditions.push(`e.created_at BETWEEN $${filterValues.length + 1} AND $${filterValues.length + 2}`);
            filterValues.push(filterDateStart, filterDateEnd);
        }

        const whereClause = filterConditions.length > 0 ? `WHERE ${filterConditions.join(' AND ')}` : '';
        const countQuery = `SELECT COUNT(*) FROM ewarranty e ${whereClause}`;
        const totalRows = parseInt((await pool.query(countQuery, filterValues)).rows[0].count);
        const totalPages = Math.ceil(totalRows / limit);

        const dataQuery = `SELECT * FROM ewarranty e ${whereClause} ORDER BY e.ewarranty_code DESC LIMIT $${filterValues.length + 1} OFFSET $${filterValues.length + 2}`;
        const dataValues = [...filterValues, limit, offset];
        const result = await pool.query(dataQuery, dataValues);

        res.render('eWarranty', {
            data: result.rows,
            role,
            currentPage: parseInt(page),
            totalPages,
            searchKeyword: search.trim(),
            filterDateStart,
            filterDateEnd
        });
    } catch (err) {
        console.error('Error while fetching Asset:', err);
        res.status(500).send('Gagal mengambil data dari database');
    }
};

exports.getEwarrantyRegisterView = async (req, res) => {
    try {
        const role = req.user?.role;
        const product = await pool.query(`SELECT dmd.no_catalog, dmd.product_name, mew.uuid FROM detail_monitoring_data dmd JOIN monitoring_e_warranty_links mew ON dmd.id_monitoring_data = mew.id_monitoring_data`);

        res.render('eWarrantyForm', {
            role,
            dataProduct: product.rows
        });
    } catch (err) {
        console.error('Error while fetching Asset:', err);
        res.status(500).send('Gagal mengambil data dari database');
    }
};

exports.getEwarrantyTemplateView = async (req, res) => {
    try {
        const role = req.user?.role;
        const ewarranty = await pool.query(`SELECT * FROM ewarranty`);

        res.render('eWarrantyFile', {
            role,
            dataEwarranty: ewarranty.rows
        });
    } catch (err) {
        console.error('Error while fetching Asset:', err);
        res.status(500).send('Gagal mengambil data dari database');
    }
};

exports.verifyLink = async (req, res) => {
    const {
        jwt,
        encoded
    } = req.params;

    try {
        // Decode base64url menjadi string asli
        const decoded = Buffer.from(encoded, 'base64url').toString('utf-8');
        const [noCatalog, doNumber, uuid] = decoded.split(':');

        // Validasi dasar
        if (!noCatalog && !uuid ) {
            return res.send(renderSwal('Link Tidak Valid', 'Data tidak lengkap atau link rusak.'));
        }

        // Cari berdasarkan UUID dan No Catalog
        const result = await pool.query(`
            SELECT mel.*, m.delivery_order_number, m.order_number FROM monitoring_e_warranty_links mel JOIN monitoring_data m ON mel.id_monitoring_data = m.id_monitoring_data
            WHERE uuid = $1 OR no_catalog = $2
        `, [uuid, noCatalog]);

        if (result.rows.length === 0) {
            return res.send(renderSwal('UUID Tidak Ditemukan', 'UUID tidak ditemukan atau tidak valid.'));
        }

        const record = result.rows[0];

        // Cek apakah sudah diklaim
        if (record.is_claimed) {
            return res.send(renderSwal('Sudah di Daftarkan Registrasinya', 'Link eWarranty ini sudah pernah di daftarkan. Silahkan hubungi Customer Service kami di +62 811 1310 131'));
        }

        // Cek apakah token aktif
        if (jwt === 'null' || !record.jwt_token) {
            return res.send(renderSwal('Form Belum Aktif', 'Link eWarranty belum aktif. Mohon tunggu hingga pengiriman selesai.'));
        }

        try {
            // Verifikasi token JWT
            const payload = verifyToken(jwt);

            if (payload.id !== record.short_id) {
                return res.send(renderSwal('Token Tidak Cocok', 'Token tidak cocok dengan short ID.'));
            }
            console.log({
                doNumberFromBarcode: doNumber,
                doNumberFromDB: record.delivery_order_number,
                orderNumberFromDB: record.order_number
            });

            // Validasi DO atau Order Number, minimal salah satu harus cocok
            if (
                record.delivery_order_number?.trim() !== doNumber.trim() &&
                record.order_number?.trim() !== doNumber.trim()
            ) {
                return res.send(renderSwal(
                    'DO / Order Tidak Cocok',
                    'Nomor DO atau Order tidak sesuai dengan data.'
                ));
            }

            // Ambil data produk
            const product = await pool.query(`
                SELECT dmd.no_catalog, dmd.serial_number, dmd.product_name
                FROM detail_monitoring_data dmd
                JOIN monitoring_e_warranty_links mew ON dmd.id_monitoring_data = mew.id_monitoring_data
                WHERE dmd.no_catalog = $1 OR mew.uuid = $2
            `, [noCatalog, uuid]);

            return res.render('eWarrantyForm', {
                uuid,
                noCatalog,
                doNumber,
                expiredAt: record.expired_at,
                dataProduct: product.rows
            });

        } catch (err) {
            return res.send(renderSwal('Kadaluarsa', 'Link eWarranty sudah tidak berlaku atau kadaluarsa.'));
        }

    } catch (err) {
        console.error('❌ Error saat verifikasi eWarranty:', err);
        return res.send(renderSwal('Kesalahan Sistem', 'Terjadi kesalahan saat memproses link.'));
    }
};

exports.getEditEwarrantyPage = async (req, res) => {
    try {
        const role = req.user?.role;
        const id = req.params.id;
        const itemResult = await pool.query('SELECT * FROM ewarranty WHERE id_ewarranty = $1', [id]);

        if (!itemResult.rows.length) {
            console.warn('[WARN] Data ewarranty tidak ditemukan untuk ID:', id);
            return res.status(404).send('Data tidak ditemukan');
        }

        return res.render('eWarrantyEdit', {
            role,
            item: itemResult.rows[0]
        });
    } catch (err) {
        console.error('[ERROR] Saat verifikasi eWarranty:', err);
        return res.send(renderSwal('Kesalahan Sistem', 'Terjadi kesalahan saat memproses link.'));
    }
}

exports.getApproveEwarrantyPage = async (req, res) => {
    try {
        const role = req.user?.role;
        const id = req.params.id;
        const itemResult = await pool.query('SELECT * FROM ewarranty WHERE id_ewarranty = $1', [id]);

        if (!itemResult.rows.length) {
            console.warn('[WARN] Data ewarranty tidak ditemukan untuk ID:', id);
            return res.status(404).send('Data tidak ditemukan');
        }

        return res.render('eWarrantyApprove', {
            role,
            item: itemResult.rows[0]
        });
    } catch (err) {
        console.error('[ERROR] Saat verifikasi eWarranty:', err);
        return res.send(renderSwal('Kesalahan Sistem', 'Terjadi kesalahan saat memproses link.'));
    }
}

// View Receipt File (controller tambahan)
exports.viewReceiptFile = (req, res) => {
    const filename = req.params.filename;

    // Path file asli (yang sudah disimpan sebelumnya)
    const filePath = path.join(__dirname, '../../public/uploads/ewarranty', filename);

    if (fs.existsSync(filePath)) {
        return res.sendFile(filePath);
    } else {
        return res.status(404).send('File tidak ditemukan');
    }
};

exports.printPDF = async (req, res) => {
    try {
        const {
            id
        } = req.params;

        const result = await pool.query('SELECT * FROM ewarranty WHERE id_ewarranty = $1', [id]);
        const ewarranty = result.rows[0];

        if (!ewarranty) return res.status(404).send('Data not found');

        const templatePath = path.join(__dirname, '../../views/eWarrantyFile.ejs');

        // Konversi gambar ke base64
        const framePath = path.resolve(__dirname, '../../public/adminlte/dist/img/Design E-Warranty.png');
        const servingQualityPath = path.resolve(__dirname, '../../public/adminlte/dist/img/unnamed.jpg');
        const logoPath = path.resolve(__dirname, '../../public/adminlte/dist/img/logoabn.png');
        const tagLineAbn = path.resolve(__dirname, '../../public/adminlte/dist/img/tagline.png');

        const frameBase64 = `data:image/png;base64,${toBase64(framePath)}`;
        const servingQualityBase64 = `data:image/png;base64,${toBase64(servingQualityPath)}`;
        const logoBase64 = `data:image/png;base64,${toBase64(logoPath)}`;
        const taglineAbnBase64 = `data:image/png;base64,${toBase64(tagLineAbn)}`;

        const fontEwarranty = path.resolve(__dirname, '../../public/adminlte/dist/img/MYRIADPRO-REGULAR.woff');
        const fontBase64 = `data:font/woff;base64,${toBase64(fontEwarranty)}`;

        const html = await ejs.renderFile(templatePath, {
            dataEwarranty: ewarranty,
            framePath: frameBase64,
            servingQualityPath: servingQualityBase64,
            logoPath: logoBase64,
            tagLineAbn: taglineAbnBase64,
            fontEwarranty: fontBase64
        });

        const browser = await puppeteer.launch({
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        const page = await browser.newPage();
        await page.setContent(html, {
            waitUntil: 'networkidle0'
        });

        const pdfBuffer = await page.pdf({
            format: 'A4',
            printBackground: true,
        });

        await browser.close();

        res.set({
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="e-warranty-${ewarranty.customer_name.replace(/\s+/g, '_')}.pdf"`,
            'Content-Length': pdfBuffer.length,
        });

        res.send(pdfBuffer);
    } catch (err) {
        console.error('PDF Export Error:', err);
        res.status(500).send('Internal Server Error');
    }
};

// ------------------------------------ POST ----------------------------------------
//CREATE E-WARRANTY
exports.createEwarranty = async (req, res) => {
    upload(req, res, async (err) => {
        if (err) {
            // ❗️Handling untuk error 413 dari multer
            if (err.code === "LIMIT_FILE_SIZE") {
                return res.status(413).send(`
                    <html>
                        <head>
                            <script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>
                        </head>
                        <body>
                            <script>
                                Swal.fire({
                                    icon: 'error',
                                    title: 'File Terlalu Besar!',
                                    text: 'Ukuran maksimal file adalah 10MB.',
                                    confirmButtonColor: '#2eaf7d'
                                }).then(() => {
                                    window.history.back();
                                });
                            </script>
                        </body>
                    </html>
                `);
            }

            // ❗️Error upload lainnya
            return res.send(`
                <html>
                    <head>
                        <script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>
                    </head>
                    <body>
                        <script>
                            Swal.fire({
                                icon: 'error',
                                title: 'Upload Gagal',
                                text: '${err.message || 'Terjadi kesalahan saat upload file.'}',
                                confirmButtonColor: '#2eaf7d'
                            }).then(() => {
                                window.history.back();
                            });
                        </script>
                    </body>
                </html>
            `);
        }

        // ...lanjut proses insert eWarranty (seperti yang sudah kamu buat)
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const {
                doNumber,
                uuid,
                customer_name,
                company_name,
                email,
                phone,
                address,
                installation_date,
                product_brand,
                product_name,
                catalog_number,
                serial_number,
                color,
                purchase_date,
                purchase_method,
                institution
            } = req.body;

            const file = req.file;
            let encryptedPath = null;
            let receiptFilename = null;

            if (file) {
                if (!['image/jpeg', 'image/png', 'application/pdf'].includes(file.mimetype)) {
                    return res.status(400).send(renderSwal(
                        'Gagal',
                        'Tipe file tidak diizinkan. Hanya JPG, PNG, dan PDF yang boleh diunggah.',
                        'error'
                    ));
                }
                
                const filename = file.filename;
                const filePath = path.join("public/uploads/ewarranty/", file.filename);
                const hash = crypto.createHash("sha256").update(filePath).digest("hex");

                encryptedPath = hash;
                receiptFilename = filename;
            }

            // Cek apakah UUID sudah diklaim
            const checkClaimed = await client.query(`SELECT is_claimed FROM monitoring_e_warranty_links WHERE uuid = $1`, [uuid]);

            if (checkClaimed.rows.length === 0 || checkClaimed.rows[0].is_claimed) {
                await client.release();
                return res.send(renderSwal(
                    'Link Sudah Di Daftarkan',
                    'Link ini sudah pernah digunakan untuk registrasi e-Warranty. Silakan hubungi Customer Service di +62 811 1310 131.',
                    'warning'
                ));
            }

            const now = new Date();
            const bulan = String(now.getMonth() + 1).padStart(2, "0");
            const tahun = String(now.getFullYear()).slice(-2);
            const countResult = await client.query(
                `SELECT COUNT(*) FROM ewarranty WHERE TO_CHAR(created_at, 'MM') = $1 AND TO_CHAR(created_at, 'YY') = $2`,
                [bulan, tahun]
            );

            const nomorUrut = String(parseInt(countResult.rows[0].count) + 1).padStart(4, "0");
            const ewarrantyCode = `ABN-EWARR${bulan}${tahun}${nomorUrut}`;
            const expiredDate = new Date(installation_date);
            expiredDate.setFullYear(expiredDate.getFullYear() + 1);

            await client.query(`
                INSERT INTO ewarranty (
                    customer_name, customer_company, customer_email, customer_phone, customer_address, 
                    product_brand, product_name, product_catalog, product_sn, 
                    product_color, purchase_from, purchase_date, installation_date, 
                    receipt, created_at, expired_date, ewarranty_code, receipt_file_name, customer_institution, is_approve, delivery_order_number
                ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,NOW(),$15,$16,$17,$18,false,$19)
            `, [
                customer_name, company_name, email, phone, address,
                product_brand, product_name, catalog_number, serial_number,
                color, purchase_method, purchase_date, installation_date,
                encryptedPath, expiredDate, ewarrantyCode, receiptFilename, institution, doNumber
            ]);

            await client.query(`UPDATE monitoring_e_warranty_links SET is_claimed = true WHERE uuid = $1`, [uuid]);
            await client.query('COMMIT');
            client.release();
            console.log ("INI PAYLOAD ", req.body)
            return res.send(renderSwal(
                'Berhasil',
                'E-Warranty Berhasil di Submit. Silakan cek email secara berkala.',
                'success',
                '/'
            ));
        } catch (error) {
            await client.query('ROLLBACK');
            client.release();
            console.error("❌ Create eWarranty failed:", error);
            return res.send(renderSwal('Gagal', 'Terjadi kesalahan saat mengirim e-Warranty.', 'error'));
        }
    });
};

exports.editEWarranty = async (req, res) => {
    try {
        const role = req.user?.role;
        const user = req.session.user;

        // ✅ Cegah jika bukan admin
        if (role !== 1) {
            req.flash("toastError", "Anda tidak memiliki izin untuk mengedit data.");
            return res.redirect("/eWarranty");
        }

        const {
            id
        } = req.params;

        const {
            customer_name,
            company_name,
            email,
            phone,
            address,
            installation_date,
            product_brand,
            product_name,
            catalog_number,
            serial_number,
            color,
            purchase_date,
            purchase_method,
            customer_institution
        } = req.body;

        // ✅ Ambil ewarranty_code untuk keperluan log
        const codeResult = await pool.query(
            'SELECT ewarranty_code FROM ewarranty WHERE id_ewarranty = $1',
            [id]
        );
        const ewarrantyCode = codeResult.rows[0]?.ewarranty_code || null;

        // ✅ Update data
        const updateQuery = `
            UPDATE ewarranty SET
                customer_name = $1,
                customer_company = $2,
                customer_email = $3,
                customer_phone = $4,
                customer_address = $5,
                installation_date = $6,
                product_brand = $7,
                product_name = $8,
                product_catalog = $9,
                product_sn = $10,
                product_color = $11,
                purchase_date = $12,
                purchase_from = $13,
                updated_at = NOW(),
                customer_institution = $14
            WHERE id_ewarranty = $15
        `;

        const values = [
            customer_name,
            company_name,
            email,
            phone,
            address,
            installation_date,
            product_brand,
            product_name,
            catalog_number,
            serial_number,
            color,
            purchase_date,
            purchase_method,
            customer_institution,
            id
        ];

        await pool.query(updateQuery, values);

        // ✅ Simpan log
        await pool.query(
            `INSERT INTO log_ewarranty 
                (id_ewarranty, user_id, role_name, name, ewarranty_code, keterangan, created_at) 
            VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
            [
                id,
                user.user_id,
                user.role_name,
                user.name,
                ewarrantyCode,
                'EDIT E-WARRANTY'
            ]
        );

        req.flash('toastSuccess', 'E-Warranty berhasil diperbarui.');
        return res.redirect('/eWarranty');
    } catch (error) {
        console.error("Gagal mengupdate e-Warranty:", error);
        req.flash('toastError', 'Terjadi kesalahan saat memperbarui e-Warranty.');
        res.redirect("/eWarranty");
    }
};

exports.approveEwarranty = async (req, res) => {
    const {
        id
    } = req.params;

    try {
        const user = req.session.user;
        const result = await pool.query('SELECT * FROM ewarranty WHERE id_ewarranty = $1', [id]);
        const ewarranty = result.rows[0];
        if (!ewarranty) return res.status(404).send('Data tidak ditemukan');

        await pool.query(`UPDATE ewarranty SET is_approve = true WHERE id_ewarranty = $1`, [id]);

        // Jalankan proses berat di background (tanpa menunggu)
        generatePdfAndSendEmail(ewarranty);

        await pool.query(
            `INSERT INTO log_ewarranty 
                (id_ewarranty, user_id, role_name, name, ewarranty_code, keterangan, created_at) 
            VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
            [
                id,
                user.user_id,
                user.role_name,
                user.name,
                ewarranty.ewarranty_code,
                'APPROVE E-WARRANTY'
            ]
        );
        req.flash("toastSuccess", "E-Warranty berhasil di Approve. File PDF akan dikirim ke email.");
        res.redirect("/eWarranty");

    } catch (err) {
        console.error('❌ Error in approveEwarranty:', err);
        req.flash('toastError', 'E-Warranty gagal di Approve.');
        res.status(500).redirect('/eWarranty');
    }
};