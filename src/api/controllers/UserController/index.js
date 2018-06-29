class UserController {
  constructor(container) {
    this.user = container.getModel('User');
  }

  add(userInfo) {
    return this.user.add(userInfo);
  }
}

module.exports = UserController;
