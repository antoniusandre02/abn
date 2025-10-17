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

// helper konversi file ke base64
function toBase64(filePath) {
    return fs.readFileSync(filePath, {
        encoding: 'base64'
    });
}

// Helper: konversi bulan ke Romawi
const monthToRoman = (month) => {
    const romans = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];
    return romans[month - 1] || '';
};

// Helper: mapping calibration_name ke kode format
const getCalibrationCode = (name) => {
    switch (name) {
        case "Macropipette":
            return "Macro";
        case "Micropipette":
            return "Micro";
        case "Multipette":
            return "Multi-P";
        case "Dispenser":
            return "Disp";
        case "MultiChannel":
            return "Multi-C";
        default:
            return name; // fallback jika belum terdaftar
    }
};

// GET
exports.getPipetteListPage = async (req, res) => {
    try {
        const {
            search = '', filterDateStart = '', filterDateEnd = '', page = 1
        } = req.query;
        const limit = 100;
        const offset = (parseInt(page) - 1) * limit;
        const role = req.user?.role;
        const searchPattern = `%${search.trim()}%`;
        console.log("ini role", role);
        let filterConditions = [];
        let filterValues = [];

        if (search.trim()) {
            filterConditions.push(`(e.certificate_number ILIKE $${filterValues.length + 1} OR e.name_owner ILIKE $${filterValues.length + 1} OR e.product_name ILIKE $${filterValues.length + 1})`);
            filterValues.push(searchPattern);
        }

        if (filterDateStart && filterDateEnd) {
            filterConditions.push(`e.created_at BETWEEN $${filterValues.length + 1} AND $${filterValues.length + 2}`);
            filterValues.push(filterDateStart, filterDateEnd);
        }

        const whereClause = filterConditions.length > 0 ? `WHERE ${filterConditions.join(' AND ')}` : '';
        const countQuery = `SELECT COUNT(*) FROM calibration_certificates e ${whereClause}`;
        const totalRows = parseInt((await pool.query(countQuery, filterValues)).rows[0].count);
        const totalPages = Math.ceil(totalRows / limit);

        const dataQuery = `SELECT * FROM calibration_certificates e ${whereClause} ORDER BY e.certificate_number DESC LIMIT $${filterValues.length + 1} OFFSET $${filterValues.length + 2}`;
        const dataValues = [...filterValues, limit, offset];
        const result = await pool.query(dataQuery, dataValues);

        res.render('pipetteCalibration', {
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

exports.getPipetteForm = async (req, res) => {
    try {
        const role = req.user?.role;
        res.render('pipetteCalibrationForm', {
            role
        });
    } catch (err) {
        console.error('Error while fetching Asset:', err);
        res.status(500).send('Gagal mengambil data dari database');
    }
};

exports.getEditPipettePage = async (req, res) => {
    try {
        const role = req.user?.role;
        const id = req.params.id;

        const result = await pool.query(`
            SELECT
                cc.*,
                ch.id_channel,
                ch.channel_number,
                ch.uncertainty,
                ch.status,
                cr.id_result,
                cr.volume,
                cr.correction AS correction
            FROM calibration_certificates cc
            LEFT JOIN calibration_channels ch ON cc.id_certificate = ch.id_certificate
            LEFT JOIN calibration_results cr ON ch.id_channel = cr.id_channel
            WHERE cc.id_certificate = $1
            ORDER BY ch.channel_number, cr.volume
        `, [id]);

        if (!result.rows.length) {
            return res.status(404).send('Data tidak ditemukan');
        }

        // --- Grouping Data per Channel ---
        const certData = {
            ...result.rows[0],
            channels: []
        };

        const channelMap = {};

        for (const row of result.rows) {
            if (!channelMap[row.id_channel]) {
                channelMap[row.id_channel] = {
                    id_channel: row.id_channel,
                    channel_number: row.channel_number,
                    uncertainty: row.uncertainty,
                    status: row.status,
                    results: []
                };
                certData.channels.push(channelMap[row.id_channel]);
            }

            if (row.id_result) {
                channelMap[row.id_channel].results.push({
                    id_result: row.id_result,
                    volume: row.volume,
                    correction: row.correction
                });
            }
        }
        // Setelah loop selesai
        for (const ch of Object.values(channelMap)) {
            // Urutkan berdasarkan volume ASC
            ch.results.sort((a, b) => Number(a.volume) - Number(b.volume));
        }


        // --- Tambahan Baru: Hitung Default Volumes & Jumlah Channel ---
        // Ambil semua volume unik dari hasil join
        // Ambil semua volume unik dan urutkan ascending
        const allVolumes = [
            ...new Set(result.rows.filter(r => r.volume !== null).map(r => Number(r.volume)))
        ].sort((a, b) => a - b);


        // Ambil jumlah channel unik
        const uniqueChannels = [
            ...new Set(result.rows.filter(r => r.channel_number !== null).map(r => r.channel_number))
        ];

        // Tambahkan ke data certificate agar bisa dipakai di EJS
        certData.defaultVolumes = allVolumes;
        certData.numberOfChannels = uniqueChannels.length;

        return res.render('pipetteCalibrationEdit', {
            role,
            item: certData
        });
    } catch (err) {
        console.error('[ERROR] Saat Edit Calibration Pipette:', err);
        return res.status(500).send('Kesalahan sistem');
    }
};

exports.getViewPipettePage = async (req, res) => {
    try {
        const role = req.user?.role;
        const id = req.params.id;

        const result = await pool.query(`
            SELECT
                cc.*,
                ch.id_channel,
                ch.channel_number,
                ch.uncertainty,
                ch.status,
                cr.id_result,
                cr.volume,
                cr.correction AS correction
            FROM calibration_certificates cc
            LEFT JOIN calibration_channels ch ON cc.id_certificate = ch.id_certificate
            LEFT JOIN calibration_results cr ON ch.id_channel = cr.id_channel
            WHERE cc.id_certificate = $1
            ORDER BY ch.channel_number, cr.volume
        `, [id]);

        if (!result.rows.length) {
            return res.status(404).send('Data tidak ditemukan');
        }

        // --- Grouping Data per Channel ---
        const certData = {
            ...result.rows[0],
            channels: []
        };

        const channelMap = {};

        for (const row of result.rows) {
            if (!channelMap[row.id_channel]) {
                channelMap[row.id_channel] = {
                    id_channel: row.id_channel,
                    channel_number: row.channel_number,
                    uncertainty: row.uncertainty,
                    status: row.status,
                    results: []
                };
                certData.channels.push(channelMap[row.id_channel]);
            }

            if (row.id_result) {
                channelMap[row.id_channel].results.push({
                    id_result: row.id_result,
                    volume: row.volume,
                    correction: row.correction
                });
            }
        }
        // Setelah loop selesai
        for (const ch of Object.values(channelMap)) {
            // Urutkan berdasarkan volume ASC
            ch.results.sort((a, b) => Number(a.volume) - Number(b.volume));
        }


        // --- Tambahan Baru: Hitung Default Volumes & Jumlah Channel ---
        // Ambil semua volume unik dari hasil join
        // Ambil semua volume unik dan urutkan ascending
        const allVolumes = [
            ...new Set(result.rows.filter(r => r.volume !== null).map(r => Number(r.volume)))
        ].sort((a, b) => a - b);


        // Ambil jumlah channel unik
        const uniqueChannels = [
            ...new Set(result.rows.filter(r => r.channel_number !== null).map(r => r.channel_number))
        ];

        // Tambahkan ke data certificate agar bisa dipakai di EJS
        certData.defaultVolumes = allVolumes;
        certData.numberOfChannels = uniqueChannels.length;

        return res.render('pipetteCalibrationView', {
            role,
            item: certData
        });
    } catch (err) {
        console.error('[ERROR] Saat Edit Calibration Pipette:', err);
        return res.status(500).send('Kesalahan sistem');
    }
};

exports.getPrintPipettePage = async (req, res) => {
    try {
        const role = req.user?.role;
        const id = req.params.id;

        // === 1️⃣ Ambil data utama dari database ===
        const result = await pool.query(`
      SELECT
          cc.*,
          ch.id_channel,
          ch.channel_number,
          ch.uncertainty,
          ch.status,
          cr.id_result,
          cr.volume,
          cr.correction AS correction
      FROM calibration_certificates cc
      LEFT JOIN calibration_channels ch ON cc.id_certificate = ch.id_certificate
      LEFT JOIN calibration_results cr ON ch.id_channel = cr.id_channel
      WHERE cc.id_certificate = $1
      ORDER BY ch.channel_number, cr.volume
    `, [id]);

        if (!result.rows.length) {
            return res.status(404).send('Data tidak ditemukan');
        }

        // === 2️⃣ Grouping data per channel ===
        const certData = {
            ...result.rows[0],
            channels: []
        };

        const channelMap = {};

        for (const row of result.rows) {
            if (!channelMap[row.id_channel]) {
                channelMap[row.id_channel] = {
                    id_channel: row.id_channel,
                    channel_number: row.channel_number,
                    uncertainty: row.uncertainty,
                    status: row.status,
                    results: []
                };
                certData.channels.push(channelMap[row.id_channel]);
            }

            if (row.id_result) {
                channelMap[row.id_channel].results.push({
                    id_result: row.id_result,
                    volume: row.volume,
                    correction: row.correction
                });
            }
        }

        // urutkan hasil tiap channel berdasarkan volume ASC
        for (const ch of Object.values(channelMap)) {
            ch.results.sort((a, b) => Number(a.volume) - Number(b.volume));
        }

        // === 3️⃣ Hitung volume unik dan jumlah channel ===
        const allVolumes = [
            ...new Set(result.rows.filter(r => r.volume !== null).map(r => Number(r.volume)))
        ].sort((a, b) => a - b);

        const uniqueChannels = [
            ...new Set(result.rows.filter(r => r.channel_number !== null).map(r => r.channel_number))
        ];

        certData.defaultVolumes = allVolumes;
        certData.numberOfChannels = uniqueChannels.length;

        // === 4️⃣ Load background dan gambar tambahan ===
        const bgPath = path.resolve(__dirname, '../../public/adminlte/dist/img/Design E-Calibration.png');
        const logoPath = path.resolve(__dirname, '../../public/adminlte/dist/img/logoabn.png');
        const tagLinePath = path.resolve(__dirname, '../../public/adminlte/dist/img/tagline.png');

        const bgBase64 = `data:image/png;base64,${toBase64(bgPath)}`;
        const logoBase64 = `data:image/png;base64,${toBase64(logoPath)}`;
        const tagLineBase64 = `data:image/png;base64,${toBase64(tagLinePath)}`;

        // === 5️⃣ Render EJS ke HTML ===
        const templatePath = path.join(__dirname, '../../views/pipetteCalibrationFile.ejs');
        const html = await ejs.renderFile(templatePath, {
            role,
            item: certData,
            backgroundPath: bgBase64,
            logoPath: logoBase64,
            tagLinePath: tagLineBase64
        });

        // === 6️⃣ Generate PDF dengan Puppeteer ===
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

        // === 7️⃣ Kirim hasil PDF ke user ===
        res.set({
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="calibration_${certData.calibration_number || 'document'}.pdf"`,
            'Content-Length': pdfBuffer.length,
        });

        res.send(pdfBuffer);

    } catch (err) {
        console.error('[ERROR] Saat Print Calibration Pipette:', err);
        return res.status(500).send('Kesalahan sistem');
    }
};

//POST
exports.createPipetteCalibration = async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");

        const {
            calibration_number,
            calibration_name,
            manufacturer,
            serial_number,
            pipette_type,
            volume_range,
            resolution,
            name_owner,
            address_owner,
            acceptance_date,
            calibration_date,
            environment_temp1,
            environment_temp2,
            air_pressure1,
            air_pressure2,
            environment_humidity1,
            environment_humidity2,
            measure_type,
            uncertainty,
            status,
            channels,
            traceability,
            unit
        } = req.body;
        const getMeasureName = (type) => {
            switch (type) {
                case "T1":
                    return "Analitical Balance Sarforius MCE125S-2500-A";
                case "T2":
                    return "Analitical Balance Sarforius MSU225S-100-DA";
                default:
                    return "Unknown Measure";
            }
        };

        // 1️⃣ Generate certificate_number otomatis
        const date = new Date(calibration_date);
        const romanMonth = monthToRoman(date.getMonth() + 1);
        const yearShort = date.getFullYear().toString().slice(-2);
        const calibrationCode = getCalibrationCode(calibration_name);

        const certificate_number = `${calibration_number}/${measure_type}/${calibrationCode}/LK-115-IDN/${romanMonth}/${yearShort}`;
        const measure_name = getMeasureName(measure_type);

        // 2️⃣ Insert ke calibration_certificates
        const certQuery = `
            INSERT INTO calibration_certificates (
                calibration_number, certificate_number, calibration_name, manufacturer, serial_number, pipette_type,
                volume_range, resolution, name_owner, address_owner,
                acceptance_date, calibration_date, environment_temp1, environment_temp2,
                air_pressure1, air_pressure2, environment_humidity1, environment_humidity2,
                measure_type, unit, traceability, measure_name, created_at, is_approved
            ) VALUES (
                $1,$2,$3,$4,$5,$6,
                $7,$8,$9,$10,$11,
                $12,$13,$14,$15,
                $16,$17,$18,$19,
                $20, $21, $22, NOW(), false
            )
            RETURNING id_certificate
        `;

        const certValues = [
            calibration_number,
            certificate_number,
            calibration_name,
            manufacturer,
            serial_number,
            pipette_type,
            volume_range,
            resolution,
            name_owner,
            address_owner,
            acceptance_date,
            calibration_date,
            environment_temp1,
            environment_temp2,
            air_pressure1,
            air_pressure2,
            environment_humidity1,
            environment_humidity2,
            measure_type,
            unit,
            measure_name,
            traceability
        ];

        const {
            rows
        } = await client.query(certQuery, certValues);
        const id_certificate = rows[0].id_certificate;

        // 3️⃣ Loop tiap channel → insert ke calibration_channels
        if (channels && typeof channels === "object") {
            for (const [channelKey, channelData] of Object.entries(channels)) {
                const insertChannelQuery = `
                    INSERT INTO calibration_channels (
                        id_certificate, channel_number, uncertainty, status, created_at
                    )
                    VALUES ($1, $2, $3, $4, NOW())
                    RETURNING id_channel
                `;

                const channelValues = [
                    id_certificate,
                    parseInt(channelKey) + 1,
                    uncertainty,
                    status,
                ];

                const channelRes = await client.query(insertChannelQuery, channelValues);
                const id_channel = channelRes.rows[0].id_channel;

                // 4️⃣ Insert hasil kalibrasi (volume & correction)
                if (channelData.results && Array.isArray(channelData.results)) {
                    for (const result of channelData.results) {
                        const {
                            volume,
                            correction
                        } = result;

                        await client.query(
                            `
                                INSERT INTO calibration_results (
                                    id_channel, volume, correction, created_at
                                )
                                VALUES ($1, $2, $3, NOW())
                            `,
                            [id_channel, volume, correction]
                        );
                    }
                }
            }
        }

        await client.query("COMMIT");
        res.redirect("/pipette");
    } catch (err) {
        await client.query("ROLLBACK");
        console.error("❌ Error saving pipette calibration:", err);
        res.status(500).send("Failed to save calibration data.");
    } finally {
        client.release();
    }
};

exports.editPipetteCalibration = async (req, res) => {
    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        const {
            id_certificate,
            calibration_number,
            measure_type,
            calibration_name,
            manufacturer,
            serial_number,
            pipette_type,
            volume_range,
            resolution,
            unit,
            name_owner,
            address_owner,
            traceability,
            acceptance_date,
            calibration_date,
            issued_date,
            environment_temp1,
            environment_temp2,
            air_pressure1,
            air_pressure2,
            environment_humidity1,
            environment_humidity2,
            uncertainty,
            status,
            channels // bentuk: { 1: { uncertainty, status, results: [{volume, correction}] }, ... }
        } = req.body;

        console.log("ini req body", req.body);
        console.log("ini channels", req.body.channels);
        req.body.channels.forEach((ch, idx) => {
            console.log(`➡️ Channel ${idx + 1}:`);
            console.log("   Uncertainty:", ch.uncertainty);
            console.log("   Results:", ch.results);
        });
        // --- 1️⃣ Update info certificate utama ---
        await client.query(
            `
      UPDATE calibration_certificates
      SET calibration_number=$1, measure_type=$2, calibration_name=$3,
          manufacturer=$4, serial_number=$5, pipette_type=$6, volume_range=$7,
          resolution=$8, unit=$9, name_owner=$10, address_owner=$11, traceability=$12,
          acceptance_date=$13, calibration_date=$14, issued_date=$15,
          environment_temp1=$16, environment_temp2=$17, air_pressure1=$18, air_pressure2=$19,
          environment_humidity1=$20, environment_humidity2=$21
      WHERE id_certificate=$22
      `,
            [
                calibration_number,
                measure_type,
                calibration_name,
                manufacturer,
                serial_number,
                pipette_type,
                volume_range,
                resolution,
                unit,
                name_owner,
                address_owner,
                traceability,
                acceptance_date,
                calibration_date,
                issued_date,
                environment_temp1,
                environment_temp2,
                air_pressure1,
                air_pressure2,
                environment_humidity1,
                environment_humidity2,
                id_certificate,
            ]
        );

        // --- 2️⃣ Ambil data existing channels ---
        const existingChannelsRes = await client.query(
            `SELECT id_channel, channel_number FROM calibration_channels WHERE id_certificate = $1 ORDER BY channel_number ASC`,
            [id_certificate]
        );

        const existingChannels = existingChannelsRes.rows;
        const existingCount = existingChannels.length;
        // --- 3️⃣ Loop semua channels dari form ---
        const newCount = channels.length;

        for (let i = 0; i < newCount; i++) {
            const chData = channels[i];
            const channelNumber = i + 1;
            const results = chData?.results || [];

            if (channelNumber <= existingCount) {
                // 🟢 Channel sudah ada → update
                const id_channel = existingChannels[channelNumber - 1].id_channel;

                await client.query(
                    `UPDATE calibration_channels
             SET uncertainty = $1, status = $2, updated_at = NOW()
             WHERE id_channel = $3`,
                    [uncertainty, status, id_channel]
                );

                // Hapus hasil lama lalu insert ulang
                await client.query(`DELETE FROM calibration_results WHERE id_channel = $1`, [id_channel]);

                for (const r of results) {
                    await client.query(
                        `INSERT INTO calibration_results (id_channel, volume, correction, created_at)
                 VALUES ($1, $2, $3, NOW())`,
                        [id_channel, r.volume, r.correction || 0]
                    );
                }
            } else {
                // 🟡 Channel baru → insert baru
                const insert = await client.query(
                    `INSERT INTO calibration_channels (id_certificate, channel_number, uncertainty, status, created_at)
             VALUES ($1, $2, $3, $4, NOW())
             RETURNING id_channel`,
                    [id_certificate, channelNumber, uncertainty, status]
                );

                const id_channel = insert.rows[0].id_channel;

                for (const r of results) {
                    await client.query(
                        `INSERT INTO calibration_results (id_channel, volume, correction, created_at)
                 VALUES ($1, $2, $3, NOW())`,
                        [id_channel, r.volume, r.correction || 0]
                    );
                }
            }
        }


        // --- 4️⃣ Kalau jumlah channel dikurangi → hapus sisanya ---
        if (newCount < existingCount) {
            for (let i = newCount + 1; i <= existingCount; i++) {
                const id_channel = existingChannels[i - 1].id_channel;
                await client.query(`DELETE FROM calibration_results WHERE id_channel=$1`, [id_channel]);
                await client.query(`DELETE FROM calibration_channels WHERE id_channel=$1`, [id_channel]);
            }
        }

        await client.query("COMMIT");
        res.redirect("/pipette");
    } catch (err) {
        await client.query("ROLLBACK");
        console.error("❌ Error updating calibration:", err);
        res.status(500).send("Error updating calibration data");
    } finally {
        client.release();
    }
};