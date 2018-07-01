class UserController {
  constructor({ User }) {
    this.user = User;
  }

  add(userInfo) {
    return this.user.add(userInfo);
  }
}

module.exports = UserController;
