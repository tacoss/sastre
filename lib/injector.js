const RESOLVED_STATE = Symbol('@@Resolved');

class Injector {
  constructor(definition, injectables) {
    this.factory = definition;
    this.deps = injectables;
  }

  static hasLocked(target) {
    return !!target[RESOLVED_STATE];
  }

  static supports(target) {
    return target instanceof Injector;
  }

  static assign(target, extensions) {
    if (!['object', 'function'].includes(typeof target) || Array.isArray(target)) {
      throw new Error(`Target is not an object, given '${target}'`);
    }

    if (target[RESOLVED_STATE]) {
      throw new Error('Cannot assign to locked values');
    }

    Object.assign(target, extensions);
    Object.defineProperty(target, RESOLVED_STATE, {});

    return target;
  }

  unwrap(resolver) {
    const keys = Object.keys(resolver.values);
    const proxy = {};

    Object.keys(this.deps).forEach(key => {
      const propName = key.replace(/^get/, '');

      if (!keys.includes(propName)) {
        throw new Error(`Missing '${propName}' dependency`);
      }

      Object.defineProperty(proxy, propName, {
        get: () => {
          if (!resolver.values[propName]) {
            throw new Error(`Value '${propName}' is not defined`);
          }

          if (!Injector.hasLocked(resolver.values[propName])) {
            const target = resolver.values[propName];
            const source = this.deps[key](resolver.values);

            Injector.assign(target, resolver.unwrap(source));
          }

          return resolver.values[propName];
        },
      });
    });

    return this.factory(proxy);
  }
}

module.exports = Injector;
