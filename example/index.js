/* eslint-disable no-unused-expressions */

const container = require('@src/container');
const expect = require('chai').expect;

// standard classes
const Token = container.getModel('Token');
const token = new Token();

expect(Token.makeId()).to.eql(42);
expect(token instanceof Token).to.be.true;

// injected class-constructor
const userController = container.getController('UserController');

// sequelize model
const User = container.getModel('User');

module.exports = {
  run: () =>
    Promise.resolve()
      .then(() => User.sync({ force: true }))
      .then(() => userController.add({ name: 'Example' }))
      .then(result => console.log(result.get())),
};

if (require.main === module) {
  module.exports.run();
}
