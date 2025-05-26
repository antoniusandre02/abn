// testDb.js
const pool = require('./db');

pool.query('SELECT * FROM role_accounts', (err, res) => {
  if (err) {
    console.error('❌ Koneksi Gagal:', err);
  } else {
    console.log('✅ Koneksi Berhasil. Waktu sekarang:', res.rows[0].now);
  }

  pool.end(); // tutup koneksi
});
