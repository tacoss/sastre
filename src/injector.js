import { inspect } from 'util';
import Exception from './exception';

const RESOLVED_STATE = Symbol('@@Resolved');
const IS_INJECTABLE = Symbol('@@Injector');

function info(value, prop) {
  return Object.getOwnPropertyDescriptor(value, prop);
}

function isClass(value) {
  const descriptor = info(value, 'prototype');

  return (descriptor && descriptor.writable === false) || value.toString().indexOf('class') === 0;
}

function isAsync(value) {
  return Object.prototype.toString.call(value) === '[object AsyncFunction]';
}

function classInjector(Factory) {
  return deps => new Factory(deps);
}

function functionInjector(definition) {
  /* istanbul ignore if */
  if (isAsync(definition)) {
    return () => definition;
  }

  return typeof definition.prototype !== 'undefined'
    ? (() => definition)
    : definition;
}

export default class Injector {
  constructor(definition, injectables, definitionFile) {
    if (typeof definition !== 'function') {
      throw new Exception(`Cannot inject non-callable values, given ${inspect(definition)}`);
    }

    if (!injectables || Array.isArray(injectables) || typeof injectables !== 'object') {
      throw new Exception(`Invalid injectables, given ${inspect(injectables)}`);
    }

    const _isClass = isClass(definition);

    Object.defineProperty(this, '_class', {
      enumerable: false,
      value: _isClass,
    });

    Object.defineProperty(this, '_factory', {
      enumerable: false,
      value: _isClass
        ? classInjector(definition)
        : functionInjector(definition),
    });

    Object.defineProperty(this, '_filepath', {
      enumerable: false,
      value: definitionFile,
    });

    Object.defineProperty(this, '_definition', {
      enumerable: false,
      value: definition,
    });

    Object.defineProperty(this, '_dependencies', {
      enumerable: false,
      value: injectables,
    });
  }

  static get Symbol() {
    return IS_INJECTABLE;
  }

  static hasLocked(target) {
    return !!target[RESOLVED_STATE];
  }

  static supports(target) {
    return target instanceof Injector;
  }

  static assign(target, refresh, extensions) {
    if (['object', 'function'].indexOf(typeof target) === -1 || Array.isArray(target)) {
      throw new Exception(`Target is not an object, given ${inspect(target)}`);
    }

    if (!refresh && target[RESOLVED_STATE]) {
      throw new Exception('Cannot assign to locked values');
    }

    Object.assign(target, extensions);
    Object.defineProperty(target, RESOLVED_STATE, {
      enumerable: false,
      value: true,
    });

    return target;
  }

  static bind(resolver, definition, defCallbacks) {
    const keys = Object.keys(resolver.values);
    const deps = definition._dependencies;
    const wrap = definition._factory;

    const values = {};
    const proxy = new Proxy({}, {
      get: (obj, key) => {
        if (inspect.custom === key) return `Injector<${Object.keys(deps).join(', ')}>`;
        if (Symbol.iterator === key) return [][key].bind(Object.keys(deps));
        if (Symbol.toStringTag === key) return 'Injector';

        if (!values[key]) {
          throw new Exception(`Missing '${key}' provider`);
        }

        const value = values[key]();

        if (!value) {
          throw new Exception(`Dependency '${key}' not given`);
        }
        return value
      },
    });

    Object.getOwnPropertyNames(deps).forEach(key => {
      const propName = key.replace(/^get/, '');

      if (keys.indexOf(propName) === -1) {
        throw new Exception(`Missing '${propName}' dependency`);
      }

      if (!resolver.values[propName]) {
        throw new Exception(`Value '${propName}' is not defined`);
      }

      const descriptor = info(deps, key);
      const isGetter = !!descriptor.get;
      const method = descriptor.get || descriptor.value;

      if (typeof method !== 'function') {
        throw new Exception(`Invalid resolver, given ${inspect(method)}`);
      }

      if (isGetter) {
        values[propName] = method.bind(resolver.valueOf());
        return;
      }

      values[propName] = () => {
        if (!resolver[`@${propName}`]) {
          const newValue = method.call(resolver.valueOf(), proxy);

          resolver[`@${propName}`] = newValue || resolver.get(propName, defCallbacks);
        }

        return resolver[`@${propName}`];
      };
    });

    try {
      return wrap(proxy);
    } catch (e) {
      console.debug(`${e.message} at ./${definition._filepath}`);
    }
  }

  static use(resolver, definition) {
    const deps = definition._dependencies;
    const wrap = definition._factory;

    const values = {};
    const proxy = {};

    Object.getOwnPropertyNames(deps).forEach(key => {
      const propName = key.replace(/^get/, '');

      Object.defineProperty(proxy, propName, {
        get: () => {
          if (typeof values[key] === 'undefined') {
            if (typeof deps[key] !== 'function') {
              throw new Exception(`Invalid resolver, given ${inspect(deps[key])}`);
            }

            values[key] = deps[key].call(resolver.valueOf()) || null;
          }

          return values[key];
        },
      });
    });

    try {
      return wrap(proxy);
    } catch (e) {
      console.debug(`${e.message} at ./${definition._filepath}`);
    }
  }

  get isClass() {
    return this._class;
  }

  valueOf() {
    return this._definition;
  }
}
