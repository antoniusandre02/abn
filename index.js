// index.js
const { server } = require('./app');
const PORT = process.env.PORT;

server.listen(PORT, () => {
  console.log(`✅ Server jalan di http://localhost:${PORT}`);
});