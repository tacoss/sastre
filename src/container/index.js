const ModelsResolver = require('./models');

const path = require('path');

class Container {
  constructor() {
    this.models = new ModelsResolver(path.resolve(__dirname, '../api/models'));
  }

  getModel(name) {
    return this.models.get(name);
  }
}

module.exports = new Container();
