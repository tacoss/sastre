const Resolver = require('@lib/resolver');

class ControllerDecorator {
  constructor(sequelize) {
    return (name, definition) => {
      console.log('>>>', name, definition);
    };
  }
}

class ControllersResolver {
  constructor(controllersDir) {
    return new Resolver(controllersDir);
  }
}

module.exports = ControllersResolver;
