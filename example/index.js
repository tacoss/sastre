/* eslint-disable no-unused-expressions */

const { expect } = require('chai');

const container = require('@src/container'); // eslint-disable-line

// standard classes
const Token = container.getModel('Token');
const token = new Token();

expect(Token.makeId()).to.eql(42);
expect(token instanceof Token).to.be.true;

// injected class-constructor
const userController = container.getController('UserController');

// sequelize model
const User = container.getModel('User');

function run() {
  return Promise.resolve()
    .then(() => User.sync({ force: true }))
    .then(() => userController.add({ name: 'Example' }))
    .then(result => console.log(result.get()));
}

module.exports = {
  run,
};

if (require.main === module) {
  run();
}
