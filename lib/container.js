const Injector = require('./injector');

class Container {
  constructor(dependencies) {
    Object.assign(this, dependencies);
  }

  static unwrap(resolver, definition) {
    if (!definition || typeof definition === 'function' || typeof definition !== 'object') {
      return definition;
    }

    const target = {};

    Object.keys(definition).forEach(propName => {
      const value = definition[propName];

      if (Injector.supports(value)) {
        target[propName] = Injector.bind(resolver, value);
      } else {
        target[propName] = Container.unwrap(resolver, definition[propName]);
      }
    });

    return target;
  }
}

module.exports = Container;
