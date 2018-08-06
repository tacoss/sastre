'use strict';

const Exception = require('./exception');
const Injector = require('./injector');
const inspect = require('util').inspect;

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
        target[propName] = Container.unwrap(resolver, value, afterCallback);
      }
    });

    return target;
  }

  valueOf() {
    return this._root;
  }

  get(value, callback) {
    let target = this.values[value];

    if (target === Injector.Symbol) {
      return {};
    }

    if (!target || Array.isArray(target) || ['object', 'function'].indexOf(typeof target) === -1) {
      throw new Exception(`Target '${value}' is not an object, given ${inspect(target)}`);
    }

    if (Injector.supports(target)) {
      if (target.isClass) {
        const Class = target.valueOf();

        if (Class.prototype.constructor.length !== 1) {
          return callback(value, Class) || Class;
        }
      }

      target = Injector.use(this, target);
    }

    if (!(this._lock[value] || Injector.hasLocked(target))) {
      this._lock[value] = true;

      try {
        const extensions = Container.unwrap(this, this.registry[value], callback);
        const decorated = callback(value, Injector.assign(target, extensions));

        if (decorated && decorated !== target) {
          this.values[value] = decorated;
          this._lock[value] = false;

          return decorated;
        }
      } catch (e) {
        throw new Exception(`Definition of '${value}' failed. ${e.message}`, e);
      }
    }

    return target;
  }
}

module.exports = Container;
