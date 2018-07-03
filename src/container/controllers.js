const Resolver = require('@lib/resolver');

class ControllersResolver {
  constructor(controllersDir, container) {
    return new Resolver(controllersDir, Resolver.use(container, (name, definition) => {
      console.log('Custom logic here, e.g. GRPC IoC (aka front-controller)', name, definition);
    }));
  }
}

module.exports = ControllersResolver;
