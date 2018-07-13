const Resolver = require('@lib/resolver');
const Sequelize = require('sequelize');

class ModelsResolver {
  constructor(container, modelsDir) {
    const sequelize = new Sequelize('sqlite::memory:');

    return new Resolver(container, modelsDir, {
      before(name, definition) {
        const { attributes, ...options } = definition;

        return sequelize.define(name, attributes || {}, options);
      },
      after(name, definition) {
        Object.assign(definition, definition.classMethods);
        Object.assign(definition.prototype, definition.instanceMethods);

        delete definition.classMethods;
        delete definition.instanceMethods;
      },
    });
  }
}

module.exports = ModelsResolver;
