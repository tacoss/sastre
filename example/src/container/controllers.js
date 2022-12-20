const { Resolver } = require('@lib'); // eslint-disable-line

class ControllersResolver {
  constructor(container, controllersDir) {
    return new Resolver(container, controllersDir, (name, definition) => {
      console.log('Custom logic here, e.g. GRPC IoC (aka front-controller)', name);

      return definition;
    }).resolve();
  }
}

module.exports = ControllersResolver;
