const RESOLVED_STATE = Symbol('@@Resolved');

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
      throw new Error('Cannot inject non-callable values');
    }

    this.factory = factoryInjector(definition);
    this.dependencies = injectables;
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
    Object.defineProperty(target, RESOLVED_STATE, {
      enumrable: false,
      value: true,
    });

    return target;
  }

  static bind(resolver, definition) {
    const keys = Object.keys(resolver._values);
    const deps = definition.dependencies;
    const wrap = definition.factory;

    const values = {};
    const proxy = {};

    Object.keys(deps).forEach(key => {
      const propName = key.replace(/^get/, '');

      if (!keys.includes(propName)) {
        throw new Error(`Missing '${propName}' dependency`);
      }

      if (!resolver._values[propName]) {
        throw new Error(`Value '${propName}' is not defined`);
      }

      if (typeof deps[key] !== 'function') {
        throw new Error(`Invalid resolver, given '${deps[key]}'`);
      }

      const factory = deps[key].bind(resolver);
      const resolved = factory(resolver._values);

      values[propName] = resolved || resolver.get(propName);
    });

    keys.forEach(key => {
      Object.defineProperty(proxy, key, {
        get: () => {
          if (!values[key]) {
            throw new Error(`Missing '${key}' provider`);
          }

          return values[key];
        },
      });
    });

    return wrap(proxy);
  }
}

module.exports = Injector;
