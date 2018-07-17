const RESOLVED_STATE = Symbol('@@Resolved');

const { inspect } = require('util');

function isClass(value) {
  const descriptor = Object.getOwnPropertyDescriptor(value, 'prototype');

  return (descriptor && descriptor.writable === false) || value.toString().indexOf('class') === 0;
}

function classInjector(Factory) {
  return deps => new Factory(deps);
}

function factoryInjector(definition) {
  if (isClass(definition)) {
    return classInjector(definition);
  }

  return typeof definition.prototype !== 'undefined'
    ? (() => definition)
    : definition;
}

class Injector {
  constructor(definition, injectables) {
    if (typeof definition !== 'function') {
      throw new Error(`Cannot inject non-callable values, given ${inspect(definition)}`);
    }

    if (!injectables || Array.isArray(injectables) || typeof injectables !== 'object') {
      throw new Error(`Invalid injectables, given ${inspect(injectables)}`);
    }

    Object.defineProperty(this, '_factory', {
      enumerable: false,
      value: factoryInjector(definition),
    });

    Object.defineProperty(this, '_dependencies', {
      enumerable: false,
      value: injectables,
    });
  }

  static hasLocked(target) {
    return !!target[RESOLVED_STATE];
  }

  static supports(target) {
    return target instanceof Injector;
  }

  static assign(target, extensions) {
    if (!['object', 'function'].includes(typeof target) || Array.isArray(target)) {
      throw new Error(`Target is not an object, given ${inspect(target)}`);
    }

    if (target[RESOLVED_STATE]) {
      throw new Error('Cannot assign to locked values');
    }

    Object.assign(target, extensions);
    Object.defineProperty(target, RESOLVED_STATE, {
      enumrable: false,
      value: true,
    });

    return target;
  }

  static bind(resolver, definition, afterCallback) {
    const keys = Object.keys(resolver.values);
    const deps = definition._dependencies;
    const wrap = definition._factory;

    const values = {};
    const proxy = {};

    Object.keys(deps).forEach(key => {
      const propName = key.replace(/^get/, '');

      if (!keys.includes(propName)) {
        throw new Error(`Missing '${propName}' dependency`);
      }

      if (!resolver.values[propName]) {
        throw new Error(`Value '${propName}' is not defined`);
      }

      if (typeof deps[key] !== 'function') {
        throw new Error(`Invalid resolver, given ${inspect(deps[key])}`);
      }

      values[propName] = () => {
        const resolved = deps[key].call(resolver, resolver.values);

        return resolved || resolver.get(propName, afterCallback);
      };
    });

    keys.forEach(key => {
      Object.defineProperty(proxy, key, {
        get: () => {
          if (!values[key]) {
            throw new Error(`Missing '${key}' provider`);
          }

          return values[key]();
        },
      });
    });

    return wrap(proxy);
  }

  static use(container, definition) {
    const deps = definition._dependencies;
    const wrap = definition._factory;

    const values = {};
    const proxy = {};

    Object.keys(deps).forEach(key => {
      const propName = key.replace(/^get/, '');

      Object.defineProperty(proxy, propName, {
        get: () => {
          if (!values[key]) {
            values[key] = deps[key].call(container);
          }

          return values[key];
        },
      });
    });

    return wrap(proxy);
  }
}

module.exports = Injector;
