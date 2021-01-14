const path = require('path');

const ControllersResolver = require('./controllers');
const ModelsResolver = require('./models');

class Container {
  constructor() {
    this.controllers = new ControllersResolver(this, path.resolve(__dirname, '../api/controllers'));
    this.models = new ModelsResolver(this, path.resolve(__dirname, '../api/models'));
  }

  getController(name) {
    return this.controllers.get(name);
  }

  getModel(name) {
    return this.models.get(name);
  }
}

module.exports = new Container();
