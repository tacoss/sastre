const ControllersResolver = require('./controllers');
const ModelsResolver = require('./models');

const path = require('path');

class Container {
  constructor() {
    this.controllers = new ControllersResolver(path.resolve(__dirname, '../api/controllers'));
    this.models = new ModelsResolver(path.resolve(__dirname, '../api/models'));
  }

  getController(name) {
    return this.controllers.get(name);
  }

  getModel(name) {
    return this.models.get(name);
  }
}

module.exports = new Container();
