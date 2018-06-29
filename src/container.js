const Resolver = require('../lib/resolver');
const Sequelize = require('sequelize');
const path = require('path');

const sequelize = new Sequelize('sqlite::memory:');

class Container {
  constructor() {
    this.models = new Resolver(path.resolve(__dirname, '../src/api/models'), this.decorateModel.bind(this));
  }

  decorateModel(name, definition) {
    if (typeof definition === 'object') {
      const { attributes, ...options } = definition;
      const { classMethods, instanceMethods, ...fixedOptions } = options;

      // notice that defining models at this point is breaking the DI reference on provider.js
      // to nicely use destructuring we need to predefine models (with attributes) before!
      // e.g. scanning models with json-schema-sequelizer, pregister them as classes
      // and then let the Resolver do his job...

      const Model = sequelize.define(name, attributes || {}, fixedOptions);

      Object.assign(Model, classMethods);
      Object.assign(Model.prototype, instanceMethods);

      return Model;
    }
  }

  getModel(name) {
    return this.models.get(name);
  }
}

module.exports = Container;
