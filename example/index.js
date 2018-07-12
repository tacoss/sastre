const container = require('@src/container');

// standard classes
const Token = container.getModel('Token');
const token = new Token();

console.log('Token', token instanceof Token, Token.create());

// injected class-constructor
const userController = container.getController('UserController');

// sequelize model
const User = container.getModel('User');

module.exports = {
  run: () =>
    Promise.resolve()
      .then(() => User.sync({ force: true }))
      .then(() => userController.add({ name: 'Example' }))
      .then(result => console.log(result.get()))
      .catch(console.log),
};

if (require.main === module) {
  module.exports.run();
}
