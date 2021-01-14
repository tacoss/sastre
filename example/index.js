/* eslint-disable no-unused-expressions */

const { expect } = require('chai');

const container = require('@src/container'); // eslint-disable-line

// standard classes
const Token = container.getModel('Token');
const token = new Token();

expect(Token.makeId()).to.eql(42);
expect(token instanceof Token).to.be.true;

function run() {
  return Promise.resolve()
    .then(() => console.log(container.getModel('User').classMethods.add))
    .then(() => container.models.connect())
    .then(() => console.log(container.models.database.models.User.add))
    .then(() => container.getModel('User'))
    .then(() => console.log(container.models.database.models.User.add))
    .then(() => container.getModel('User'))
    .then(User => User.sync({ force: true }))
    .then(() => container.getController('UserController'))
    .then(userController => userController.add({ name: 'Example' }))
    .then(result => console.log(result.get()))
    .catch(e => console.log('E_FAIL', e));
}

module.exports = {
  run,
};

if (require.main === module) {
  run();
}
