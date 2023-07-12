import path from 'path';
import fs from 'fs';

import Injector from './injector.mjs';
import Container from './container.mjs';
import Exception from './exception.mjs';

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
  return value.replace(/-([a-z])/gi, (_, $1) => $1.toUpperCase());
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

    if (directory.includes('file://')) {
      directory = path.dirname(directory.substr(7));
    }

    Object.defineProperty(this, '_directory', {
      enumerable: false,
      value: directory,
    });

    Object.defineProperty(this, '_decorators', {
      enumerable: false,
      value: getDecorators(hooks, rootContainer),
    });

    Object.defineProperty(this, '_parent', {
      enumerable: false,
      value: rootContainer,
    });
  }

  static async scanFiles(cwd, cb) {
    if (!fs.existsSync(cwd)) {
      throw new Error(`Invalid directory, given '${cwd}'`);
    }

    const resolverInfo = {
      registry: {},
      values: {},
      types: [],
      keys: [],
    };

    const typeFiles = {};
    const entryFiles = Resolver.searchFiles(cwd, true)
      .sort((a, b) => a.split('/').length - b.split('/').length)
      .filter(x => !['index.js', 'index.ts', 'index.cjs', 'index.mjs'].includes(x));

    entryFiles.forEach(file => {
      if (file.includes('.ts')) {
        typeFiles[file] = entryFiles.includes(file.replace('.ts', '.mjs'))
          || entryFiles.includes(file.replace('.ts', '.cjs'))
          || entryFiles.includes(file.replace('.ts', '.js'));
      }
    });

    const provider = `provider.${['cjs', 'mjs']
      .find(x => fs.existsSync(path.join(cwd, `provider.${x}`))) || 'js'}`;

    const rootProvider = path.join(cwd, provider);
    const rootDependencies = await Resolver.useFile(rootProvider);

    async function injectDefinition(target, providerFile, definitionFile) {
      const resolved = await Resolver.useFile(providerFile);
      return new Injector(target, assignProps({}, rootDependencies, resolved), path.relative('.', definitionFile));
    }

    for (const entry of entryFiles) {
      if (typeFiles[entry]) continue;

      const properties = entry.split('/');
      const value = ucFirst(camelCase(properties.shift()));

      const definitionFile = path.join(cwd, entry);
      const definition = entry.includes('.ts') ? Function : await Resolver.loadFile(definitionFile);

      properties.pop();

      const providerFile = path.join(cwd, value, properties.concat(provider).join('/'));
      const isInjectable = typeof definition === 'function';

      if (!resolverInfo.values[value]) {
        resolverInfo.values[value] = !properties.length
          ? await ((isInjectable && injectDefinition(definition, providerFile, definitionFile)) || definition)
          : {};
      }

      if (!isInjectable && fs.existsSync(providerFile)) {
        throw new Exception(`Unexpected provider file, given ${providerFile}`);
      }

      resolverInfo.types.push({
        path: [value].concat(properties.slice()),
        index: entry.split('/').pop(),
        tscript: typeFiles[entry] || entry.includes('.ts'),
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
            target[propName] = await injectDefinition(definition, providerFile, definitionFile);
          } else {
            target = target[propName] = {};
          }
        } else {
          target = target[propName];
        }
      }
    }

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

  static async loadFile(definition) {
    let mod = await import(definition);
    mod = mod.__esModule ? mod.default : mod;
    mod = mod.default || mod;
    return mod;
  }

  static async useFile(providerFile) {
    const dependencies = {};

    if (fs.existsSync(providerFile)) {
      const resolved = await Resolver.loadFile(providerFile);

      assignProps(dependencies, resolved);
    }

    return dependencies;
  }

  static searchFiles(cwd, flat) {
    const filter = /^index\.(?:ts|[cm]?js)$/;
    const entries = fs.readdirSync(cwd);
    const results = [];

    entries.forEach(file => {
      const dir = `${cwd}/${file}`;
      const stat = fs.statSync(dir);

      if (stat && stat.isDirectory()) {
        results.push(...Resolver.searchFiles(dir));
      } else if (filter.test(file)) {
        results.push(dir);
      }
    });
    return flat ? results.map(x => path.relative(cwd, x)) : results;
  }

  static typesOf(self, options) {
    const { extend, comments, properties, references, declaration } = options || {};

    const buffer = [];
    const groups = { path: [], props: {} };
    const definitions = self.types.map(x => camelCase(x.path.join('-')));

    function nest(obj, path, typedefs, _interface) {
      const pre = path.map(() => '  ').join('');

      let out = '';
      Object.keys(obj.props).forEach(key => {
        const def = camelCase(path.concat(key).join('-'));
        const props = Object.keys(obj.props[key].props).length;
        const defined = definitions.includes(def);

        out += !out && path.length === 1 ? '\n' : '';

        const doc = comments ? `/**\nDeclaration for \`${path.concat(key).join('.')}\` object.\n*/\n` : '';

        if (_interface && defined && !props) {
          out += `${doc}${pre}export type ${ucFirst(camelCase(key))} = typeof ${def}Module;\n`;
        } else {
          out += _interface ? `${doc}${pre}export interface ${ucFirst(camelCase(key))}` : `${doc}${pre}${camelCase(key)}:`;

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

    self.types.forEach(type => {
      const identifier = camelCase(type.path.join('-'));

      if (definitions.includes(identifier)) {
        typedefs.push(identifier);
      }

      if (type.injectable && type.path.length > 1) {
        buffer.unshift({
          chunk: !type.tscript
            ? `import ${identifier}Module from './${type.path.concat(type.index).join('/')}';`
            : `import type { ${camelCase(type.path[type.path.length - 1])} as ${identifier}Module } from './${type.path.join('/')}';`,
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
      const exts = (definitions.includes(key) ? [`${key}Module`] : []).concat(extend || []);
      const suffix = exts.length > 0 ? ` extends ${exts.join(', ')}` : '';
      const props = [];

      if (properties) {
        properties.forEach(prop => {
          if (!(prop in groups.props[key].props)) groups.props[key].props[prop] = { props: {} };
        });
      }

      const keys = Object.keys(groups.props[key].props);
      const [schema, object] = declaration ? declaration.split(':') : ['interface'];
      const klass = ucFirst(schema);
      const sub = object ? ucFirst(object) : `${klass}Module`;

      keys.forEach(prop => {
        if (keys.length > 0) {
          if (comments) {
            props.push(`/**\nThe \`${key}.${camelCase(prop)}\` object.\n*/\n`);
          }
          props.push(`  ${camelCase(prop)}: ${key}${sub}.${ucFirst(camelCase(prop))};\n`);
        }
      });

      buffer.push(comments && {
        chunk: `/**\nModule declaration for \`${key}\` ${klass.toLowerCase()}.\n*/`,
      }, {
        type: key,
        chunk: `export interface ${key}${klass}${suffix} {${props.length > 0 ? `\n${props.join('')}` : ''}}`,
      }, comments && {
        chunk: `/**\nNamespace for \`${key}\` ${klass.toLowerCase()}.\n*/`,
      }, {
        chunk: `export namespace ${key}${sub} {${nest(groups.props[key], [key], typedefs, true)}}`,
      });
    });

    return buffer.filter(Boolean);
  }

  get types() {
    return this._container.types;
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

  async resolve(callback) {
    const result = await Resolver.scanFiles(this._directory, this._decorators.before);

    Object.defineProperty(this, '_container', {
      enumerable: false,
      value: new Container(this._parent, result),
    });

    if (callback) {
      await callback(this);
    }
    return this;
  }

  typesOf(options) {
    return Resolver.typesOf(this, options);
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
