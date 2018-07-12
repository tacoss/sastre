const Injector = require('./injector');

const glob = require('glob');
const path = require('path');
const fs = require('fs');

class Resolver {
  constructor(cwd, hooks) {
    if (typeof hooks === 'function') {
      const after = hooks;

      hooks = {
        after,
      };
    }

    this._registry = {};
    this._values = {};

    this._hooks = hooks || {};
    this._lock = {};

    Object.assign(this, Resolver.scanFiles(cwd, (...args) => this._decorate('before', ...args)));
  }

  static use(container, decorator) {
    return (name, definition) => {
      const dependencies = {};

      Object.keys(definition.deps).forEach(key => {
        const propName = key.replace(/^get/, '');

        if (typeof definition.deps[key] !== 'function') {
          throw new Error(`Invalid resolver, given '${definition.deps[key]}'`);
        }

        const factoryValue = definition.deps[key].call(container);

        if (!factoryValue || !['object', 'function'].includes(typeof factoryValue)) {
          throw new Error(`Invalid '${key}' provider, given '${factoryValue}'`);
        }

        dependencies[propName] = factoryValue;
      });

      const ClassFactory = definition.factory;
      const resolvedInstance = new ClassFactory(dependencies);
      const decoratedInstance = typeof decorator === 'function' && decorator(name, resolvedInstance);

      return decoratedInstance || resolvedInstance;
    };
  }

  static bind(resolver, definition) {
    const keys = Object.keys(resolver._values);
    const deps = Object.keys(definition.deps);

    const values = {};
    const proxy = {};

    deps.forEach(key => {
      const propName = key.replace(/^get/, '');

      if (!keys.includes(propName)) {
        throw new Error(`Missing '${propName}' dependency`);
      }

      if (!resolver._values[propName]) {
        throw new Error(`Value '${propName}' is not defined`);
      }

      if (typeof definition.deps[key] !== 'function') {
        throw new Error(`Invalid resolver, given '${definition.deps[key]}'`);
      }

      const factory = definition.deps[key].bind(resolver);

      values[propName] = factory(resolver._values) || resolver.get(propName);
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

    return definition.factory(proxy);
  }

  static scanFiles(cwd, cb) {
    const resolverInfo = {
      _registry: {},
      _values: {},
    };

    const entryFiles = glob
      .sync('**/index.js', { cwd, nosort: true })
      .sort((a, b) => a.split('/').length - b.split('/').length);

    entryFiles.forEach(entry => {
      const [value, ...properties] = entry.split('/');

      const definitionFile = path.join(cwd, entry);
      const definition = Resolver.loadFile(definitionFile);

      properties.pop();

      const providerFile = path.join(cwd, value, properties.join('/'), 'provider.js');
      const hasDependencies = fs.existsSync(providerFile);

      if (!resolverInfo._values[value]) {
        resolverInfo._values[value] = !properties.length
          ? ((hasDependencies && new Injector(definition, Resolver.loadFile(providerFile))) || definition)
          : {};
      }

      resolverInfo._registry[value] = resolverInfo._registry[value] || {};

      let target = resolverInfo._registry[value];
      let propName;

      while (properties.length) {
        propName = properties.shift();

        if (!target[propName]) {
          if (hasDependencies && !properties.length) {
            target[propName] = new Injector(definition, Resolver.loadFile(providerFile));
          } else {
            target = target[propName] = {};
          }
        }
      }
    });

    Object.keys(resolverInfo._values).forEach(prop => {
      if (typeof cb === 'function' && typeof resolverInfo._values[prop] !== 'function') {
        resolverInfo._values[prop] = cb(prop, resolverInfo._values[prop]) || resolverInfo._values[prop];
      }
    });

    return resolverInfo;
  }

  static loadFile(definition) {
    return require(definition);
  }

  _decorate(type, value, resolved) {
    return typeof this._hooks[type] === 'function'
      ? this._hooks[type](value, resolved)
      : resolved;
  }

  _unwrap(definition) {
    if (!definition || typeof definition === 'function') {
      return definition;
    }

    if (typeof definition !== 'object') {
      return definition;
    }

    const target = {};

    if (Array.isArray(definition)) {
      return definition.map(x => this._unwrap(x));
    }

    Object.keys(definition).forEach(propName => {
      const value = definition[propName];

      if (Injector.supports(value)) {
        target[propName] = Resolver.bind(this, value);
      } else {
        target[propName] = this._unwrap(definition[propName]);
      }
    });

    return target;
  }

  get(value) {
    const target = this._values[value];

    if (!['object', 'function'].includes(typeof target) || Array.isArray(target)) {
      throw new Error(`Target '${value}' is not an object, given '${target}'`);
    }

    if (!Injector.hasLocked(target) && !this._lock[value]) {
      this._lock[value] = true;

      try {
        const extensions = this._unwrap(this._registry[value]);

        Injector.assign(target, extensions);

        const decorated = this._decorate('after', value, target);

        if (decorated && decorated !== target) {
          this._values[value] = decorated;

          return decorated;
        }
      } catch (e) {
        throw new Error(`Definition of '${value}' failed. ${e.message}`);
      }
    }

    return target;
  }
}

module.exports = Resolver;
