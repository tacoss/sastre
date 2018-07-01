const Injector = require('./injector');

const glob = require('glob');
const path = require('path');
const fs = require('fs');

function def(scope, key, val) {
  Object.defineProperty(scope, key, {
    enumerable: false,
    value: val,
  });
}

class Resolver {
  constructor(cwd, hooks) {
    if (typeof hooks === 'function') {
      const after = hooks;

      hooks = {
        after,
      };
    }

    this.registry = {};
    this.values = {};

    def(this, '_hooks', hooks || {});
    def(this, '_lock', {});

    Object.assign(this, Resolver.scanFiles(cwd, (...args) => this.decorate('before', ...args)));
  }

  static use(container) {
    return (name, definition) => {
      const dependencies = {};

      Object.keys(definition.deps).forEach(key => {
        const propName = key.replace(/^get/, '');
        const factoryValue = definition.deps[key].call(container);

        if (!factoryValue || !['object', 'function'].includes(typeof factoryValue)) {
          throw new Error(`Invalid '${key}' provider, given '${factoryValue}'`);
        }

        dependencies[propName] = factoryValue;
      });

      const ClassFactory = definition.factory;
      const decoratedClass = new ClassFactory(dependencies);

      return decoratedClass;
    };
  }

  static bind(resolver, definition) {
    const keys = Object.keys(resolver.values);
    const deps = Object.keys(definition.deps);

    const values = {};
    const proxy = {};

    deps.forEach(key => {
      const propName = key.replace(/^get/, '');

      if (!keys.includes(propName)) {
        throw new Error(`Missing '${propName}' dependency`);
      }

      if (!resolver.values[propName]) {
        throw new Error(`Value '${propName}' is not defined`);
      }

      const factory = definition.deps[key].bind(resolver);

      values[propName] = factory(resolver.values) || resolver.get(propName);
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
      registry: {},
      values: {},
    };

    const entryFiles = glob
      .sync('**/index.js', { cwd, nosort: true })
      .sort((a, b) => a.split('/').length - b.split('/').length);

    entryFiles.forEach(entry => {
      const [ value, ...properties ] = entry.split('/');

      const definitionFile = path.join(cwd, entry);
      const definition = Resolver.loadFile(definitionFile);

      properties.pop();

      const providerFile = path.join(cwd, value, properties.join('/'), 'provider.js');
      const hasDependencies = fs.existsSync(providerFile);

      if (!resolverInfo.values[value]) {
        resolverInfo.values[value] = !properties.length
          ? (hasDependencies && new Injector(definition, Resolver.loadFile(providerFile)) || definition)
          : {};
      }

      resolverInfo.registry[value] = resolverInfo.registry[value] || {};

      let target = resolverInfo.registry[value];
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

    Object.keys(resolverInfo.values).forEach(prop => {
      if (typeof cb === 'function' && typeof resolverInfo.values[prop] !== 'function') {
        resolverInfo.values[prop] = cb(prop, resolverInfo.values[prop]) || resolverInfo.values[prop];
      }
    });

    return resolverInfo;
  }

  static loadFile(definition) {
    return require(definition);
  }

  decorate(type, value, resolved) {
    return typeof this._hooks[type] === 'function'
      ? this._hooks[type](value, resolved)
      : resolved;
  }

  unwrap(definition) {
    if (!definition || typeof definition === 'function') {
      return definition;
    }

    if (typeof definition !== 'object') {
      return definition;
    }

    const target = {};

    if (Array.isArray(definition)) {
      return definition.map(x => this.unwrap(x));
    }

    Object.keys(definition).forEach(propName => {
      const value = definition[propName];

      if (Injector.supports(value)) {
        target[propName] = Resolver.bind(this, value);
      } else {
        target[propName] = this.unwrap(definition[propName]);
      }
    });

    return target;
  }

  get(value) {
    const target = this.values[value];

    if (!['object', 'function'].includes(typeof target) || Array.isArray(target)) {
      throw new Error(`Target '${value}' is not an object, given '${target}'`);
    }

    if (!Injector.hasLocked(target) && !this._lock[value]) {
      this._lock[value] = true;

      try {
        const extensions = this.unwrap(this.registry[value]);

        Injector.assign(target, extensions);

        const decorated = this.decorate('after', value, target);

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

module.exports = Resolver;
