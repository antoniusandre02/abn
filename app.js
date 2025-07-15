const express = require('express');
const app = express();
const path = require('path');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const flash = require('connect-flash');
const pool = require('./db');
const fs = require('fs');
require('dotenv').config();

// === Pastikan folder uploads tersedia ===
const uploadsPath = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsPath)) {
  fs.mkdirSync(uploadsPath);
}

// === Middleware dasar ===
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// ✅ Session harus sebelum flash
app.use(session({
  secret: process.env.SESSION_SECRET, // Ganti dengan secret yang aman
  resave: false,
  saveUninitialized: false
}));

// ✅ Flash setelah session
app.use(flash());

// ✅ Inject user & token dari session
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  req.user = req.session.user || null;
  next();
});

// ✅ Inject flash message ke semua views
app.use((req, res, next) => {
  res.locals.successMessageLogin = req.flash('successMessageLogin') || null;
  res.locals.successMessage = req.flash('successMessage') || null;
  res.locals.errorMessage = req.flash('errorMessage') || null;
  next();
});


// === EJS dan static files ===
app.use('/adminlte', express.static(path.join(__dirname, 'public/adminlte')));
app.use('/barcodes', express.static(path.join(__dirname, 'public/barcodes')));
app.use(express.static(path.join(__dirname, 'public')));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// === WebSocket setup ===
const http = require('http');
const server = http.createServer(app);
const { Server } = require('socket.io');
const io = new Server(server);

app.use(cookieParser());

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

// === Routes ===
const indexRouter = require('./routes/index');
const authRoutes = require('./routes/auth/auth.routes');
const userRoutes = require('./routes/users/user.routes');
const monitoringRoutes = require('./routes/monitoring/monitoring.routes');
const assetRoutes = require('./routes/inventory/inventory.routes');
const calibrationRoutes = require('./routes/calibration/calibration.routes');

app.use('/', authRoutes);
app.use('/', indexRouter);
app.use('/', userRoutes);
app.use('/', monitoringRoutes);
app.use('/', assetRoutes);
app.use('/ewarranty/', calibrationRoutes)

// Export
module.exports = {
  app,
  server,
  io
};