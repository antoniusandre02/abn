const jwt = require('jsonwebtoken');

// Token default (misal untuk login/session 1 hari)
const generateToken = (user) => {
  return jwt.sign(
    {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      role_name: user.role_name,
      user_id: user.user_id
    },
    process.env.JWT_SECRET,
    { expiresIn: '1d' }
  );
};

// Token reject untuk validasi link reject hanya 30 menit
const generateTokenReject = (payload, expiresIn = '30m') => {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn });
};

// Verifikasi token
const verifyToken = (token) => {
  return jwt.verify(token, process.env.JWT_SECRET);
};

module.exports = {
  generateToken,
  generateTokenReject,
  verifyToken
};