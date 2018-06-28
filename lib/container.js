const Resolver = require('./resolver');
const Sequelize = require('sequelize');

const sequelize = new Sequelize('sqlite::memory:');

class Container {
  constructor(cwd) {
    this.models = new Resolver(`${cwd}/src/api/models`, (modelName, modelDefinition) => {
      if (typeof modelDefinition === 'object') {
        const { attributes, ...options } = modelDefinition;
        const { classMethods, instanceMethods, ...fixedOptions } = options;

        // notice that defining models at this point is breaking the DI reference on provider.js
        // to nicely use destructuring we need to predefine models (with attributes) before!
        // e.g. scanning models with json-schema-sequelizer, pregister them as classes
        // and then let the Resolver do his job...

        const Model = sequelize.define(modelName, attributes || {}, fixedOptions);

        Object.assign(Model, classMethods);
        Object.assign(Model.prototype, instanceMethods);

        return Model;
      }
    });
  }

  getModel(modelName) {
    return this.models.get(modelName);
  }
}

module.exports = Container;
