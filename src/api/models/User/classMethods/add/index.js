module.exports = ({ User, Token }) => async function add(userInfo) {
  const user = await User.create(userInfo);

  user.token = Token.create();

  return user.save();
};
