require('module-alias/register');

const container = require('@src/container');

// standard classes
const Token = container.getModel('Token');
const token = new Token();

console.log('Token', token instanceof Token, Token.create());

const UserController = container.getController('UserController');

// FIXME: this call should be abstracted, e.g. singleton vs newInstances, etc.
const controller = new UserController.factory(container);

// sequelize model
const User = container.getModel('User');

Promise.resolve()
  .then(() => User.sync({ force: true }))
  .then(() => controller.add({ name: 'Example' }))
  .then(result => console.log(result.get()))
  .catch(console.log);
