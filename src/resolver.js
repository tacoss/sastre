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
    if (typeof rootContainer === 'string' || Array.isArray(rootContainer)) {
      hooks = directory;
      directory = rootContainer;
      rootContainer = undefined;
    }

    Object.defineProperty(this, '_decorators', {
      enumerable: false,
      value: getDecorators(hooks, rootContainer),
    });

    // merge multiple sources into a single container instance
    const handlers = (!Array.isArray(directory) ? [directory]: directory)
      .reduce((container, cwd) => {
        if (!container) {
          container = Resolver.scanFiles(cwd, this._decorators.before);
        } else {
          const result = Resolver.scanFiles(cwd, this._decorators.before);

          Object.assign(container.registry, result.registry);
          Object.assign(container.values, result.values);
        }
        return container;
      }, null);

    Object.defineProperty(this, '_container', {
      enumerable: false,
      value: new Container(rootContainer, handlers),
    });
  }

  static scanFiles(cwd, cb) {
    if (!fs.existsSync(cwd)) {
      throw new Error(`Invalid directory, given '${cwd}'`);
    }

    const resolverInfo = {
      registry: {},
      values: {},
      types: [],
      keys: [],
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

      const tsFile = definitionFile.replace('.js', '.d.ts');

      resolverInfo.types.push({ path: [value].concat(properties.slice()), exists: fs.existsSync(tsFile) });

      if (!resolverInfo.keys.includes(value)) resolverInfo.keys.push(value);

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
    const mod = require(definition);

    if (mod.__esModule) return mod.default;
    return mod;
  }

  static useFile(providerFile) {
    const dependencies = {};

    if (fs.existsSync(providerFile)) {
      assignProps(dependencies, Resolver.loadFile(providerFile));
    }

    return dependencies;
  }

  static typesOf(self, extend) {
    const buffer = [];
    const groups = { path: [], props: {} };
    const methods = [];
    const definitions = self._container.types.map(x => camelCase(x.path.join('-')));

    function nest(obj, path) {
      const pre = path.map(() => '  ').join('');

      let out = '';
      Object.keys(obj.props).forEach(key => {
        out += !out && path.length === 1 ? '\n' : '';
        out += `${pre}${camelCase(key)}:`;

        const def = camelCase(path.concat(key).join('-'));

        let ok;
        if (definitions.includes(def)) {
          out += ` typeof ${def}Module`;
          ok = true;
        }

        if (Object.keys(obj.props[key].props).length) {
          out += `${ok ? ' &' : ''} {\n${nest(obj.props[key], path.concat(key))}${pre}};\n`;
        } else {
          out += ';\n';
        }
      });
      return out;
    }

    self._container.types.forEach(type => {
      const identifier = camelCase(type.path.join('-'));

      if (type.exists) {
        buffer.unshift({
          chunk: `import ${identifier}Module from './${type.path.join('/')}';`,
        });
      } else if (definitions.includes(identifier)) {
        buffer.push({
          chunk: `interface ${identifier}Module {}`,
        });
      }

      const parts = type.path.slice();

      let main = groups;
      while (parts.length > 0) {
        const key = parts.shift();
        if (!main.props[key]) main.props[key] = { props: {} };
        main = main.props[key];
      }
    });

    Object.keys(groups.props).forEach(key => {
      const exts = (definitions.includes(key) ? [`${key}Module`] : []).concat(extend ? [extend] : []);
      const suffix = exts.length > 0 ? ` extends ${exts.join(', ')}` : '';

      buffer.push({
        type: key,
        chunk: `export interface ${key}Interface${suffix} {${nest(groups.props[key], [key])}}`,
      });
    });

    return buffer;
  }

  get values() {
    return this._container.values;
  }

  get registry() {
    return this._container.registry;
  }

  typesOf(extend) {
    return Resolver.typesOf(this, extend);
  }

  forEach(callback) {
    this._container.keys.forEach(key => callback(this[key]));
  }

  has(name) {
    return this._container.has(name);
  }

  get(name, refresh) {
    return this._container.get(name, this._decorators, refresh);
  }
}
