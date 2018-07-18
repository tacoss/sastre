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

    Object.defineProperty(this, '_decorators', {
      enumerable: false,
      value: getDecorators(hooks, rootContainer),
    });

    Object.defineProperty(this, '_container', {
      enumerable: false,
      value: new Container(rootContainer, Resolver.scanFiles(directory, this._decorators.before)),
    });

    Object.defineProperty(this, '_directory', {
      enumerable: false,
      value: directory,
    });
  }

  static scanFiles(cwd, cb) {
    const resolverInfo = {
      registry: {},
      values: {},
    };

    const entryFiles = glob
      .sync('**/index.js', { cwd, nosort: true })
      .sort((a, b) => a.split('/').length - b.split('/').length);

    const rootProvider = path.join(cwd, 'provider.js');
    const rootDependencies = Resolver.useFile(rootProvider);

    function injectDefinition(target, providerFile) {
      return new Injector(target, Object.assign({}, rootDependencies, Resolver.useFile(providerFile)));
    }

    entryFiles.forEach(entry => {
      const [value, ...properties] = entry.split('/');

      const definitionFile = path.join(cwd, entry);
      const definition = Resolver.loadFile(definitionFile);

      properties.pop();

      const providerFile = path.join(cwd, value, properties.concat('provider.js').join('/'));
      const isInjectable = typeof definition === 'function';

      if (!resolverInfo.values[value]) {
        resolverInfo.values[value] = !properties.length
          ? ((isInjectable && injectDefinition(definition, providerFile)) || definition)
          : {};
      }

      if (!isInjectable && fs.existsSync(providerFile)) {
        throw new Error(`Unexpected provider file, given ${providerFile}`);
      }

      resolverInfo.registry[value] = resolverInfo.registry[value] || {};

      let target = resolverInfo.registry[value];
      let propName;

      while (properties.length) {
        propName = properties.shift();

        if (!target[propName]) {
          if (isInjectable && !properties.length) {
            target[propName] = injectDefinition(definition, providerFile);
          } else {
            target = target[propName] = {};
          }
        } else {
          target = target[propName];
        }
      }
    });

    Object.keys(resolverInfo.values).forEach(prop => {
      if (typeof cb === 'function' && typeof resolverInfo.values[prop] !== 'function') {
        resolverInfo.values[prop] = cb(prop, resolverInfo.values[prop]) || resolverInfo.values[prop];
      }
    });

    Object.keys(rootDependencies).forEach(key => {
      const propName = key.replace(/^get/, '');

      if (typeof resolverInfo.values[propName] === 'undefined') {
        resolverInfo.values[propName] = Injector.Symbol;
      }
    });

    return resolverInfo;
  }

  static loadFile(definition) {
    return require(definition);
  }

  static useFile(providerFile) {
    const dependencies = {};

    if (fs.existsSync(providerFile)) {
      Object.assign(dependencies, Resolver.loadFile(providerFile));
    }

    return dependencies;
  }

  get values() {
    return this._container.values;
  }

  get registry() {
    return this._container.registry;
  }

  get(name) {
    try {
      return this._container.get(name, this._decorators.after);
    } catch (e) {
      throw new Error(`${e.message}\n  in ${this._directory}`);
    }
  }
}

module.exports = Resolver;
