'use strict';

class UserController {
  constructor(ctx) {
    this.user = ctx.User;
  }

  add(userInfo) {
    return this.user.add(userInfo);
  }
}

module.exports = UserController;
