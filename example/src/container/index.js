const ControllersResolver = require('./controllers');
const ModelsResolver = require('./models');

const path = require('path');

class Container {
  constructor() {
    this.controllers = new ControllersResolver(this, path.resolve(__dirname, '../api/controllers'));
    this.models = new ModelsResolver(this, path.resolve(__dirname, '../api/models'));
  }

  getController(name) {
    return this.controllers.get(name, this);
  }

  getModel(name) {
    return this.models.get(name, this);
  }
}

module.exports = new Container();
