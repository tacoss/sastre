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

    Object.defineProperty(this, '_directory', {
      enumerable: false,
      value: directory,
    });

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

      resolverInfo.types.push({
        path: [value].concat(properties.slice()),
        injectable: isInjectable,
      });

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

  static typesOf(self, extend, properties, references) {
    const buffer = [];
    const groups = { path: [], props: {} };
    const definitions = self._container.types.map(x => camelCase(x.path.join('-')));

    function nest(obj, path, typedefs, _interface) {
      const pre = path.map(() => '  ').join('');

      let out = '';
      Object.keys(obj.props).forEach(key => {
        const def = camelCase(path.concat(key).join('-'));
        const props = Object.keys(obj.props[key].props).length;
        const defined = definitions.includes(def);

        out += !out && path.length === 1 ? '\n' : '';

        if (_interface && defined && !props) {
          out += `${pre}export type ${ucFirst(camelCase(key))} = typeof ${def}Module;\n`;
        } else {
          out += _interface ? `${pre}export interface ${ucFirst(camelCase(key))}` : `${pre}${camelCase(key)}:`;

          let ok;
          if (defined) {
            out += _interface ? ' extends' : '';
            out += ` ${_interface ? '' : 'typeof '}${def}Module`;
            ok = true;
          }

          if (props) {
            out += `${ok && !_interface ? ' &' : ''} {\n${nest(obj.props[key], path.concat(key), typedefs)}${pre}}`;
            out += _interface ? '\n' : ';\n';
          } else {
            out += _interface ? ' {}\n' : ';\n';
          }
        }
      });
      return out;
    }

    const typedefs = [];

    self._container.types.forEach(type => {
      const identifier = camelCase(type.path.join('-'));

      if (definitions.includes(identifier)) {
        typedefs.push(identifier);
      }

      if (type.injectable && type.path.length > 1) {
        buffer.unshift({
          chunk: `import type { ${camelCase(type.path[type.path.length - 1])} as ${identifier}Module } from './${type.path.join('/')}';`,
        });
      } else if (typeof references === 'function') {
        buffer.unshift({
          chunk: references(identifier, type),
        });
      } else {
        buffer.unshift({
          chunk: references
            ? `import type ${identifier}Module from './${type.path.join('/')}';`
            : `interface ${identifier}Module {}`,
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
      const props = [];

      if (properties) {
        properties.forEach(prop => {
          if (!(prop in groups.props[key].props)) groups.props[key].props[prop] = { props: {} };
        });
      }

      const keys = Object.keys(groups.props[key].props);

      keys.forEach(prop => {
        if (keys.length > 0) {
          props.push(`  ${camelCase(prop)}: ${key}.${ucFirst(camelCase(prop))};\n`);
        }
      });

      buffer.push({
        type: key,
        chunk: `export interface ${key}Interface${suffix} {${props.length > 0 ? `\n${props.join('')}` : ''}}`,
      }, {
        chunk: `declare namespace ${key} {${nest(groups.props[key], [key], typedefs, true)}}`,
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

  get typedefs() {
    if (!this._typedefs) {
      this._typedefs = this.typesOf().map(x => x.chunk).join('\n');
    }
    return this._typedefs;
  }

  typesOf(extend, properties, references) {
    return Resolver.typesOf(this, extend, properties, references);
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
