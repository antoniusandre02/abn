const express = require('express');
const app = express();
const path = require('path');
const session = require('express-session');
const flash = require('connect-flash');
const pool = require('./db');
app.use(flash());

// === Tambahkan ini untuk WebSocket ===
const http = require('http');
const server = http.createServer(app);
const { Server } = require('socket.io');
const io = new Server(server);

// WebSocket logic
io.on('connection', (socket) => {
  console.log('Client connected');

  socket.on('disconnect', () => {
    console.log('Client disconnected');
  });
});

app.use((req, res, next) => {
  req.io = io;
  next();
});
setInterval(async () => {
  const limit = 10;

  const [pickedResult, packedResult, shippedResult] = await Promise.all([
    pool.query(`SELECT * FROM monitoring_data JOIN warehouse ON monitoring_data.warehouse_location = warehouse.id_warehouse WHERE status = 'Picked' AND picked_date IS NOT NULL AND packed_date IS NULL AND picked_date BETWEEN NOW() - INTERVAL '7 days' AND NOW() ORDER BY picked_date DESC LIMIT $1`, [limit]),
    pool.query(`SELECT * FROM monitoring_data JOIN warehouse ON monitoring_data.warehouse_location = warehouse.id_warehouse WHERE status = 'Packed' AND packed_date BETWEEN NOW() - INTERVAL '7 days' AND NOW() ORDER BY packed_date DESC LIMIT $1`, [limit]),
    pool.query(`SELECT * FROM monitoring_data JOIN warehouse ON monitoring_data.warehouse_location = warehouse.id_warehouse WHERE status = 'Shipped' AND shipped_date BETWEEN NOW() - INTERVAL '7 days' AND NOW() ORDER BY shipped_date DESC LIMIT $1`, [limit]),
  ]);

  io.emit('dataUpdate', {
    pickedData: pickedResult.rows,
    packedData: packedResult.rows,
    shippedData: shippedResult.rows
  });
  // untuk refresh data per statusnya 
  console.log('Sent updated data to client');
  console.log('Timer triggered for refresh data')
}, 77 * 1000);

// === Middleware ===
app.use(express.urlencoded({ extended: true }));
app.use(express.json());


app.use(session({
  secret: 'Abn_Jkt54!2@', // Ganti dengan secret yang aman
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false } // true jika HTTPS
}));

app.use((req, res, next) => {
  res.locals.successMessage = req.flash('successMessage') || null;
  res.locals.errorMessage = req.flash('errorMessage') || null;
  next();
});


// === EJS dan Static Files ===
app.use('/adminlte', express.static(path.join(__dirname, 'public/adminlte')));
app.use('/barcodes', express.static(path.join(__dirname, 'public/barcodes')));
app.use(express.static(path.join(__dirname, 'public')));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// === Routes ===
const indexRouter = require('./routes/index');
const authRoutes = require('./routes/auth');
const soDoRoutes = require('./routes/soDo');
const scanBarcodeRoutes = require('./routes/scanBarcode');

app.use('/', authRoutes);
app.use('/', indexRouter);
app.use('/soDo', soDoRoutes);
app.use('/scanBarcode', scanBarcodeRoutes);

// Export jika diperlukan oleh file lain
module.exports = { app, server, io };
