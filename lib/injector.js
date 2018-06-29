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
    if (target[RESOLVED_STATE]) {
      throw new Error('Cannot assign locked values');
    }

    Object.assign(target, extensions);
    Object.defineProperty(target, RESOLVED_STATE, {});

    return target;
  }

  resolve(container) {
    const proxy = {};

    Object.keys(this.deps).forEach(key => {
      const propName = key.replace(/^get/, '');

      Object.defineProperty(proxy, propName, {
        get: () => {
          if (!Injector.hasLocked(container.classes[propName])) {
            const target = container.classes[propName];
            const source = this.deps[key](container.classes);

            Injector.assign(target, container.unwrap(source));
          }

          return container.classes[propName];
        },
      });
    });

    return this.factory(proxy);
  }
}

module.exports = Injector;
