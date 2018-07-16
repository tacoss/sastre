const Resolver = require('@lib/resolver');

class ControllersResolver {
  constructor(container, controllersDir) {
    return new Resolver(container, controllersDir, (name, definition) => {
      console.log('Custom logic here, e.g. GRPC IoC (aka front-controller)', name, definition);
    });
  }
}

module.exports = ControllersResolver;
