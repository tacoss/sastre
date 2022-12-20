const path = require('path');

const ControllersResolver = require('./controllers');
const ModelsResolver = require('./models');

class Container {
  getController(name) {
    return this.controllers.get(name);
  }

  getModel(name) {
    return this.models.get(name);
  }

  async resolve() {
    [this.controllers, this.models] = await Promise.all([
      new ControllersResolver(this, path.resolve(__dirname, '../api/controllers')),
      new ModelsResolver(this, path.resolve(__dirname, '../api/models')),
    ]);
    return this;
  }
}

module.exports = new Container().resolve();
