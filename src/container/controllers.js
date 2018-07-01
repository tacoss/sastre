const Resolver = require('@lib/resolver');

class ControllersResolver {
  constructor(controllersDir, container) {
    return new Resolver(controllersDir, {
      after: Resolver.use(container, 'models'),
    });
  }
}

module.exports = ControllersResolver;
