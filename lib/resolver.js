const Injector = require('./injector');
const Container = require('./container');

const glob = require('glob');
const path = require('path');
const fs = require('fs');

const ALLOWED_HOOKS = ['before', 'after'];

function getDecorators(hooks, container) {
  if (typeof hooks === 'function') {
    const after = hooks;

    hooks = {
      after,
    };
  }

  hooks = hooks || {};

  return ALLOWED_HOOKS.reduce((prev, cur) => {
    prev[cur] = (...args) => hooks[cur] && hooks[cur].call(container, ...args);

    return prev;
  }, {});
}

class Resolver {
  constructor(rootContainer, directory, hooks) {
    if (typeof rootContainer === 'string') {
      hooks = directory;
      directory = rootContainer;
      rootContainer = undefined;
    }

    this._decorators = getDecorators(hooks, rootContainer);
    this._container = new Container(Resolver.scanFiles(directory, this._decorators.before));
  }

  // static use(hooks) {
  //   const decorator = getDecorators(hooks);

  //   return function $use(name, definition) {
  //     const dependencies = {};

  //     Object.keys(definition.dependencies).forEach(key => {
  //       const propName = key.replace(/^get/, '');

  //       if (typeof definition.dependencies[key] !== 'function') {
  //         throw new Error(`Invalid resolver, given '${definition.dependencies[key]}'`);
  //       }

  //       const factoryValue = definition.dependencies[key].call(this);

  //       if (!factoryValue || !['object', 'function'].includes(typeof factoryValue)) {
  //         throw new Error(`Invalid '${key}' provider, given '${factoryValue}'`);
  //       }

  //       dependencies[propName] = factoryValue;
  //     });

  //     const ClassFactory = definition.factory;
  //     const resolvedInstance = new ClassFactory(dependencies);
  //     const decoratedInstance = decorator.after(name, resolvedInstance);

  //     return decoratedInstance || resolvedInstance;
  //   };
  // }

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

  get(name) {
    return this._container.get(name);
  }
}

module.exports = Resolver;
