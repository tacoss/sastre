const { Resolver } = require('@lib'); // eslint-disable-line

class ControllersResolver {
  constructor(container, controllersDir) {
    const self = new Resolver(container, controllersDir, (name, definition) => {
      console.log('Custom logic here, e.g. GRPC IoC (aka front-controller)', name);

      return definition;
    });

    Object.defineProperty(self, 'typedefs', {
      get: () => Resolver.typesOf(self).map(x => x.chunk).join('\n'),
    });

    return self;
  }
}

module.exports = ControllersResolver;
