module.exports = ctx =>
  function add(userInfo) {
    return ctx.User.create(userInfo).then(user => {
      user.token = ctx.Token.makeId();

      return user.save();
    });
  };
