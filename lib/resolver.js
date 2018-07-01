const Injector = require('./injector');

const glob = require('glob');
const path = require('path');
const fs = require('fs');

class Resolver {
  constructor(cwd, callback) {
    this.decorator = callback;
    this.registry = {};
    this.values = {};

    Object.defineProperty(this, '_lock', {
      enumerable: false,
      value: {},
    });

    Object.assign(this, Resolver.scanFiles(cwd));
  }

  static use(container, namespace) {
    return (name, definition) => {
      return Resolver.bind(container[namespace], {
        ...definition,
        factory(dependencies) {
          const ClassFactory = definition.factory;
          const decoratedClass = new ClassFactory(dependencies);

          return decoratedClass;
        },
      });
    };
  }

  static bind(resolver, definition) {
    const keys = Object.keys(resolver.values);
    const proxy = {};

    Object.keys(definition.deps).forEach(key => {
      const propName = key.replace(/^get/, '');

      if (!keys.includes(propName)) {
        throw new Error(`Missing '${propName}' dependency`);
      }

      Object.defineProperty(proxy, propName, {
        get: () => {
          if (!resolver.values[propName]) {
            throw new Error(`Value '${propName}' is not defined`);
          }

          return resolver.get(propName);
        },
      });
    });

    return definition.factory(proxy);
  }

  static scanFiles(cwd) {
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

    return resolverInfo;
  }

  static loadFile(definition) {
    return require(definition);
  }

  decorate(value, resolved) {
    return typeof this.decorator === 'function'
      ? this.decorator(value, resolved)
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
      throw new Error(`Target is not an object, given '${target}'`);
    }

    if (!Injector.hasLocked(target) && !this._lock[value]) {
      this._lock[value] = true;

      const extensions = this.unwrap(this.registry[value]);

      Injector.assign(target, extensions);

      const decorated = this.decorate(value, target);

      if (decorated && decorated !== target) {
        this.values[value] = decorated;

        return decorated;
      }
    }

    return target;
  }
}

module.exports = Resolver;
