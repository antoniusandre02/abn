const pool = require('./db'); // asumsi file koneksi database
const io = require('./socket'); // pastikan io diexport

setInterval(async () => {
  const limit = 10;

  const [pickedResult, packedResult, shippedResult] = await Promise.all([
    pool.query(`SELECT * FROM monitoring_data JOIN warehouse ON monitoring_data.warehouse_location = warehouse.id_warehouse WHERE status = 'Picked' ORDER BY picked_date DESC LIMIT $1`, [limit]),
    pool.query(`SELECT * FROM monitoring_data JOIN warehouse ON monitoring_data.warehouse_location = warehouse.id_warehouse WHERE status = 'Packed' ORDER BY packed_date DESC LIMIT $1`, [limit]),
    pool.query(`SELECT * FROM monitoring_data JOIN warehouse ON monitoring_data.warehouse_location = warehouse.id_warehouse WHERE status = 'Shipped' ORDER BY shipped_date DESC LIMIT $1`, [limit]),
  ]);

  io.emit('dataUpdate', {
    pickedData: pickedResult.rows,
    packedData: packedResult.rows,
    shippedData: shippedResult.rows
  });

  console.log('Sent updated data to client');
}, 10 * 60 * 1000); // 10 menit
