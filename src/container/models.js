const Resolver = require('@lib/resolver');
const Sequelize = require('sequelize');

class ModelDecorator {
  constructor(sequelize) {
    this.sequelize = sequelize;
  }

  before(name, definition) {
    const { attributes, ...options } = definition;

    return this.sequelize.define(name, attributes || {}, options);
  }

  after(name, definition) {
    Object.assign(definition, definition.classMethods);
    Object.assign(definition.prototype, definition.instanceMethods);

    delete definition.attributes;
    delete definition.classMethods;
    delete definition.instanceMethods;
  }
}

class ModelsResolver {
  constructor(modelsDir) {
    const sequelize = new Sequelize('sqlite::memory:');

    return new Resolver(modelsDir, new ModelDecorator(sequelize));
  }
}

module.exports = ModelsResolver;
