module.exports = ({ User, Token }) => function add(userInfo) {
  return User.create(userInfo).then(user => {
    user.token = Token.makeId();

    return user.save();
  });
};
