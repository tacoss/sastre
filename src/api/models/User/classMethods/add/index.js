// we could use { User, Token } here but...
// due the self-reference of User further decoration shall
// not refresh the same reference (see Object.defineProperty())

module.exports = $ => async function add(userInfo) {
  const user = await $.User.create(userInfo);

  user.token = $.Token.create();

  return user.save();
};
