module.exports = ({ Token }) => function add(userInfo) {
  return this.create(userInfo).then(user => {
    user.token = Token.makeId();

    return user.save();
  });
};
