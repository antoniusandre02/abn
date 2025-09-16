const pool = require('../../db');
const moment = require('moment');

const statusRoleMap = {
    Picked: [1, 2, 3, 12],
    Packed: [1, 4, 5, 12],
    Shipped: [1, 6, 7, 12, 16]
};

exports.getScanBarcodePage = (req, res) => {
    res.render('scanBarcode', {
        message: null
    });
};

exports.handleScanBarcode = async (req, res) => {
    const {
        barcode_do
    } = req.body;
    const user = req.session.user;

    if (!barcode_do || !user?.user_id || !user?.role) {
        return res.render('scanBarcode', {
            message: 'Barcode atau user tidak valid.'
        });
    }

    try {
        const result = await pool.query(
            'SELECT * FROM monitoring_data WHERE delivery_order_number = $1 OR order_number = $1',
            [barcode_do]
        );

        if (result.rows.length === 0) {
            return res.render('scanBarcode', {
                message: 'Data dengan barcode tersebut tidak ditemukan.'
            });
        }

        const data = result.rows[0];
        console.log(data);
        console.log(barcode_do);
        console.log(user);
        // ❌ Larangan untuk role 16 scan DO-XXX (tanpa peduli division)
        if (user.role === 16 && barcode_do.startsWith('DO-')) {
            return res.render('scanBarcode', {
                message: 'Admin E-Commerce tidak boleh scan order berawalan "DO-".'
            });
        }

        // ✅ Validasi tambahan khusus division_team = 3
        if (parseInt(data.division_team, 10) === 3 && ![1, 16].includes(user.role)) {
            return res.render('scanBarcode', {
                message: 'Kamu tidak memiliki akses untuk scan pada divisi e-Commerce.'
            });
        }


        const now = moment().format('YYYY-MM-DD HH:mm:ss');
        const currentStatus = data.status || 'Draft';

        let nextStatus = '';
        if (currentStatus === 'Draft') nextStatus = 'Picked';
        else if (currentStatus === 'Picked') nextStatus = 'Packed';
        else if (currentStatus === 'Packed') nextStatus = 'Shipped';
        else return res.render('scanBarcode', {
            message: 'Status sudah lengkap. Tidak perlu scan lagi.'
        });

        if ((nextStatus === 'Picked' && data.picked_date) ||
            (nextStatus === 'Packed' && data.packed_date) ||
            (nextStatus === 'Shipped' && data.shipped_date)) {
            return res.render('scanBarcode', {
                message: `Sudah di-scan sebagai ${nextStatus}.`
            });
        }

        if (!statusRoleMap[nextStatus].includes(user.role)) {
            return res.render('scanBarcode', {
                message: `Kamu tidak memiliki akses untuk update status "${nextStatus}".`
            });
        }

        const updateFields = {
            Picked: {
                query: `UPDATE monitoring_data SET status = 'Picked', picked_date = $1, picked_by = $2, update_at = NOW() WHERE delivery_order_number = $3`,
                message: 'Status berhasil diupdate: Picked'
            },
            Packed: {
                query: `UPDATE monitoring_data SET status = 'Packed', packed_date = $1, packed_by = $2, update_at = NOW() WHERE delivery_order_number = $3`,
                message: 'Status berhasil diupdate: Packed'
            },
            Shipped: {
                query: `UPDATE monitoring_data SET status = 'Shipped', shipped_date = $1, shipped_by = $2, is_done = true, update_at = NOW() WHERE delivery_order_number = $3 OR order_number = $3`,
                message: 'Status berhasil diupdate: Shipped'
            }
        } [nextStatus];

        await pool.query(updateFields.query, [now, user.user_id, barcode_do]);

        await pool.query(
            `INSERT INTO log_monitoring_scan (user_id, name, role_name, delivery_order_number_scanned, status_scanned, scanned_at)
            VALUES ($1, $2, $3, $4, $5, NOW())`,
            [user.user_id, user.name, user.role_name, barcode_do, nextStatus]
        );

        req.io.emit('dataUpdateTrigger');
        res.render('scanBarcode', {
            message: updateFields.message
        });

    } catch (err) {
        console.error('Gagal update:', err);
        res.render('scanBarcode', {
            message: 'Terjadi kesalahan saat memproses scan.'
        });
    }
};