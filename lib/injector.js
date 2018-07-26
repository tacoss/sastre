const RESOLVED_STATE = Symbol('@@Resolved');
const IS_INJECTABLE = Symbol('@@Injector');

const Chainable = require('./chainable');

const { inspect } = require('util');

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

function factoryInjector(definition) {
  if (isClass(definition)) {
    return classInjector(definition);
  }

  if (isAsync(definition)) {
    return () => definition;
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

  static get Symbol() {
    return IS_INJECTABLE;
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

    const resolved = {};
    const values = {};
    const proxy = {};

    Object.getOwnPropertyNames(deps).forEach(key => {
      const propName = key.replace(/^get/, '');

      if (!keys.includes(propName)) {
        throw new Error(`Missing '${propName}' dependency`);
      }

      if (!resolver.values[propName]) {
        throw new Error(`Value '${propName}' is not defined`);
      }

      const descriptor = info(deps, key);
      const isGetter = !!descriptor.get;
      const method = descriptor.get || descriptor.value;

      if (typeof method !== 'function') {
        throw new Error(`Invalid resolver, given ${inspect(method)}`);
      }

      if (isGetter) {
        values[propName] = method.bind(resolver._root);
        return;
      }

      values[propName] = () => {
        if (typeof resolved[propName] === 'undefined') {
          const newValue = method.call(resolver._root, proxy);

          resolved[propName] = newValue || resolver.get(propName, afterCallback);
        }

        return resolved[propName];
      };
    });

    keys.forEach(key => {
      Object.defineProperty(proxy, key, {
        enumerable: false,
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
              throw new Error(`Invalid resolver, given ${inspect(deps[key])}`);
            }

            values[key] = deps[key].call(resolver._root) || null;
          }

          return values[key];
        },
      });
    });

    return wrap(proxy);
  }
}

module.exports = Injector;
