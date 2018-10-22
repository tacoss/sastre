import glob from 'glob';
import path from 'path';
import fs from 'fs';

import Exception from './exception';
import Injector from './injector';
import Container from './container';

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
    prev[cur] = function call() {
      return hooks[cur] && hooks[cur].apply(container, arguments);
    };

    return prev;
  }, {});
}

function assignProps(target) {
  const sources = Array.prototype.slice.call(arguments, 1);

  sources.forEach(source => {
    if (source) {
      Object.getOwnPropertyNames(source).forEach(dep => {
        Object.defineProperty(target, dep, Object.getOwnPropertyDescriptor(source, dep));
      });
    }
  });

  return target;
}

function camelCase(value) {
  return value.replace(/-([a-z])/g, (_, $1) => $1.toUpperCase());
}

function ucFirst(value) {
  return value[0].toUpperCase() + value.substr(1);
}

export default class Resolver {
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
  }

  static scanFiles(cwd, cb) {
    const resolverInfo = {
      registry: {},
      values: {},
    };

    const entryFiles = glob
      .sync('**/index.js', { cwd, nosort: true })
      .sort((a, b) => a.split('/').length - b.split('/').length)
      .filter(f => f !== 'index.js');

    const rootProvider = path.join(cwd, 'provider.js');
    const rootDependencies = Resolver.useFile(rootProvider);

    function injectDefinition(target, providerFile) {
      return new Injector(target, assignProps({}, rootDependencies, Resolver.useFile(providerFile)));
    }

    entryFiles.forEach(entry => {
      const properties = entry.split('/');
      const value = ucFirst(camelCase(properties.shift()));

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
        throw new Exception(`Unexpected provider file, given ${providerFile}`);
      }

      resolverInfo.registry[value] = resolverInfo.registry[value] || {};

      let target = resolverInfo.registry[value];
      let propName;

      while (properties.length) {
        propName = camelCase(properties.shift());

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
      const definition = resolverInfo.values[prop];

      if (typeof cb === 'function' && !Injector.supports(definition)) {
        resolverInfo.values[prop] = cb(prop, definition) || definition;
      }
    });

    Object.getOwnPropertyNames(rootDependencies).forEach(key => {
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
      assignProps(dependencies, Resolver.loadFile(providerFile));
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
    return this._container.get(name, this._decorators.after);
  }
}
