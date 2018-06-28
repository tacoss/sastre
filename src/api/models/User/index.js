const User = {
  create(userInfo) {
    return {
      ...userInfo,
      save() {
        return this;
      },
    };
  },
};

module.exports = User;
