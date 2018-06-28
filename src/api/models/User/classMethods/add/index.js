module.exports = ({ User, Token }) => async function add(userInfo) {
  const user = User.create(userInfo);

  user.token = Token.create();

  return await user.save();
};
