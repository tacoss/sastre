const Injector = require('./injector');

const { inspect } = require('util');

class Container {
  constructor(rootContainer, dependencies) {
    Object.assign(this, dependencies);

    Object.defineProperty(this, '_root', {
      enumerable: false,
      value: rootContainer,
    });

    Object.defineProperty(this, '_lock', {
      enumerable: false,
      value: {},
    });
  }

  static unwrap(resolver, definition, afterCallback) {
    if (!definition || typeof definition === 'function' || typeof definition !== 'object') {
      return definition;
    }

    const target = {};

    Object.keys(definition).forEach(propName => {
      const value = definition[propName];

      if (Injector.supports(value)) {
        target[propName] = Injector.bind(resolver, value, afterCallback);
      } else {
        target[propName] = Container.unwrap(resolver, definition[propName], afterCallback);
      }
    });

    return target;
  }

  get(value, callback) {
    let target = this.values[value];

    if (!target || Array.isArray(target) || !['object', 'function'].includes(typeof target)) {
      throw new Error(`Target '${value}' is not an object, given ${inspect(target)}`);
    }

    if (!(this._lock[value] || Injector.hasLocked(target))) {
      this._lock[value] = true;

      if (Injector.supports(target)) {
        target = Injector.use(this._root, target);
      }

      try {
        const extensions = Container.unwrap(this, this.registry[value], callback);
        const decorated = callback(value, Injector.assign(target, extensions));

        if (decorated && decorated !== target) {
          this.values[value] = decorated;

          return decorated;
        }
      } catch (e) {
        throw new Error(`Definition of '${value}' failed. ${e.message}`);
      }
    }

    return target;
  }
}

module.exports = Container;
