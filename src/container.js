import { inspect } from 'util';
import Exception from './exception';
import Injector from './injector';

export default class Container {
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

  static unwrap(resolver, definition, hooks) {
    if (!definition || typeof definition === 'function' || typeof definition !== 'object') {
      return definition;
    }

    const target = {};

    Object.keys(definition).forEach(propName => {
      const value = definition[propName];

      if (Injector.supports(value)) {
        target[propName] = Injector.bind(resolver, value, hooks);
      } else {
        target[propName] = Container.unwrap(resolver, value, hooks);
      }
    });

    return target;
  }

  valueOf() {
    return this._root;
  }

  get(value, hooks) {
    let target = this.values[value];

    if (target === Injector.Symbol) {
      return null;
    }

    if (!target || Array.isArray(target) || ['object', 'function'].indexOf(typeof target) === -1) {
      throw new Exception(`Target '${value}' is not an object, given ${inspect(target)}`);
    }

    if (Injector.supports(target)) {
      if (target.isClass) {
        const Class = target.valueOf();

        if (Class.prototype.constructor.length !== 1) {
          return (hooks && hooks.after(value, Class)) || Class;
        }
      }

      target = Injector.use(this, target);
    }

    if (!(this._lock[value] || Injector.hasLocked(target))) {
      this._lock[value] = true;

      try {
        let retval = Injector.assign(target, Container.unwrap(this, this.registry[value], hooks));

        if (hooks && hooks.after) {
          retval = hooks.after(value, retval) || retval;
        }

        if (typeof retval !== 'undefined') {
          this.values[value] = retval;
        }

        return this.values[value];
      } catch (e) {
        throw new Exception(`Definition of '${value}' failed. ${e.message}`, e);
      }
    }

    return target;
  }
}
