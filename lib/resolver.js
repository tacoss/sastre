const Injector = require('./injector');

const glob = require('glob');
const path = require('path');
const fs = require('fs');

class Resolver {
  constructor(rootContainer, directory, hooks) {
    this._dependencies = (rootContainer && typeof rootContainer.getDependencies === 'function')
      ? rootContainer.getDependencies()
      : {};

    this._decorator = Resolver.get(hooks, rootContainer);

    const resolved = Resolver.scanFiles(directory, this._decorator.before);

    this._registry = resolved.registry;
    this._values = resolved.values;

    this._lock = {};
  }

  static use(hooks) {
    const decorator = Resolver.get(hooks);

    return function $use(name, definition) {
      const dependencies = {};

      Object.keys(definition.dependencies).forEach(key => {
        const propName = key.replace(/^get/, '');

        if (typeof definition.dependencies[key] !== 'function') {
          throw new Error(`Invalid resolver, given '${definition.dependencies[key]}'`);
        }

        const factoryValue = definition.dependencies[key].call(this);

        if (!factoryValue || !['object', 'function'].includes(typeof factoryValue)) {
          throw new Error(`Invalid '${key}' provider, given '${factoryValue}'`);
        }

        dependencies[propName] = factoryValue;
      });

      const ClassFactory = definition.factory;
      const resolvedInstance = new ClassFactory(dependencies);
      const decoratedInstance = decorator.after(name, resolvedInstance);

      return decoratedInstance || resolvedInstance;
    };
  }

  static get(hooks, container) {
    if (typeof hooks === 'function') {
      const after = hooks;

      hooks = {
        after,
      };
    }

    hooks = hooks || {};

    return ['before', 'after'].reduce((prev, cur) => {
      prev[cur] = (...args) => hooks[cur] && hooks[cur].call(container, ...args);

      return prev;
    }, {});
  }

  static bind(resolver, definition) {
    const keys = Object.keys(resolver._values);

    const values = {};
    const proxy = {};

    function mix(deps, validate) {
      Object.keys(deps).forEach(key => {
        const propName = key.replace(/^get/, '');

        if (validate && !keys.includes(propName)) {
          throw new Error(`Missing '${propName}' dependency`);
        }

        if (!resolver._values[propName]) {
          throw new Error(`Value '${propName}' is not defined`);
        }

        if (typeof deps[key] !== 'function') {
          throw new Error(`Invalid resolver, given '${deps[key]}'`);
        }

        const factory = deps[key].bind(resolver);

        values[propName] = factory(resolver._values) || resolver.get(propName);
      });
    }

    mix(resolver._dependencies);
    mix(definition.dependencies, true);

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
      const [value, ...properties] = entry.split('/');

      const definitionFile = path.join(cwd, entry);
      const definition = Resolver.loadFile(definitionFile);

      properties.pop();

      const providerFile = path.join(cwd, value, properties.join('/'), 'provider.js');
      const hasDependencies = fs.existsSync(providerFile);

      if (!resolverInfo.values[value]) {
        resolverInfo.values[value] = !properties.length
          ? ((hasDependencies && new Injector(definition, Resolver.loadFile(providerFile))) || definition)
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

  unwrap(definition) {
    if (!definition || typeof definition === 'function' || typeof definition !== 'object') {
      return definition;
    }

    const target = {};

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
    const target = this._values[value] || this._dependencies[value];

    if (!['object', 'function'].includes(typeof target) || Array.isArray(target)) {
      throw new Error(`Target '${value}' is not an object, given '${target}'`);
    }

    if (!Injector.hasLocked(target) && !this._lock[value]) {
      this._lock[value] = true;

      try {
        const extensions = this.unwrap(this._registry[value]);
        const decorated = this._decorator.after(value, Injector.assign(target, extensions));

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
