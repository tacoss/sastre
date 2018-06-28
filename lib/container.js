const Resolver = require('./resolver');
const Sequelize = require('sequelize');

const sequelize = new Sequelize('sqlite::memory:');

class Container {
  constructor(cwd) {
    this.models = new Resolver(`${cwd}/src/api/models`, (modelName, modelDefinition) => {
      if (typeof modelDefinition === 'object') {
        const { attributes, ...options } = modelDefinition;
        const { classMethods, instanceMethods, ...fixedOptions } = options;

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
