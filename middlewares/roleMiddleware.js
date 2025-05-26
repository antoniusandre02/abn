function checkRole(allowedRoles = []) {
  return function (req, res, next) {
    if (!req.session.user) {
      return res.redirect('/login');
    }

    const userRole = req.session.user.role;

    if (allowedRoles.includes(userRole)) {
      return next();
    }

    return res.status(403).render('unauthorized', { user: req.session.user });
  };
}

module.exports = checkRole;
