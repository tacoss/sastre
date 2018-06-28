const RESOLVED_STATE = Symbol('@@Resolved');

class Injectable {
  constructor(definition, providerFile) {
    this.factory = definition;
    this.dependencies = require(providerFile);
  }

  static hasLocked(target) {
    return !!target[RESOLVED_STATE];
  }

  static supports(target) {
    return target instanceof Injectable;
  }

  static assign(Target, extensions) {
    let value = Target;

    if (typeof value === 'function') {
      value = class extends Target { };
    }

    Object.assign(value, extensions);
    Object.defineProperty(value, RESOLVED_STATE, {});

    return value;
  }

  resolve(container) {
    const proxy = {};

    Object.keys(this.dependencies).forEach(key => {
      const propName = key.replace(/^get/, '');

      Object.defineProperty(proxy, propName, {
        get: () => {
          if (!Injectable.hasLocked(container.classes[propName])) {
            const target = container.classes[propName];
            const source = this.dependencies[key](container.classes);

            Injectable.assign(target, container.unwrap(source));
          }

          return container.classes[propName];
        },
      });
    });

    return this.factory(proxy);
  }
}

module.exports = Injectable;
