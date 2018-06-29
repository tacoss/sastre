const Resolver = require('@lib/resolver');
const Sequelize = require('sequelize');

class ModelsResolver {
  constructor(modelsDir) {
    this.sequelize = new Sequelize('sqlite::memory:');

    return new Resolver(modelsDir, this.decorateModel.bind(this));
  }

  decorateModel(name, definition) {
    if (typeof definition === 'object') {
      const { attributes, ...options } = definition;
      const { classMethods, instanceMethods, ...fixedOptions } = options;

      // notice that defining models at this point is breaking the DI reference on provider.js
      // to nicely use destructuring we need to predefine models (with attributes) before!
      // e.g. scanning models with json-schema-sequelizer, pregister them as classes
      // and then let the Resolver do his job...

      const Model = this.sequelize.define(name, attributes || {}, fixedOptions);

      Object.assign(Model, classMethods);
      Object.assign(Model.prototype, instanceMethods);

      return Model;
    }
  }
}

module.exports = ModelsResolver;
