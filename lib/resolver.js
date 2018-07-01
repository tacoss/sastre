const Injector = require('./injector');

const glob = require('glob');
const path = require('path');
const fs = require('fs');

class Resolver {
  constructor(cwd, callback) {
    const entryFiles = glob
      .sync('**/index.js', { cwd, nosort: true })
      .sort((a, b) => a.split('/').length - b.split('/').length);

    this.decorator = callback;
    this.registry = {};
    this.values = {};
    this._lock = {};

    entryFiles.forEach(entry => {
      const [ value, ...properties ] = entry.split('/');
      const definition = require(path.join(cwd, entry));

      properties.pop();

      const providerFile = path.join(cwd, value, properties.join('/'), 'provider.js');
      const hasDependencies = fs.existsSync(providerFile);

      if (!this.values[value]) {
        this.values[value] = !properties.length
          ? (hasDependencies && new Injector(definition, require(providerFile)) || definition)
          : {};
      }

      this.registry[value] = this.registry[value] || {};

      let target = this.registry[value];
      let propName;

      while (properties.length) {
        propName = properties.shift();

        if (!target[propName]) {
          if (hasDependencies && !properties.length) {
            target[propName] = new Injector(definition, require(providerFile));
          } else {
            target = target[propName] = {};
          }
        }
      }
    });
  }

  decorate(value, resolved) {
    return typeof this.decorator === 'function'
      ? this.decorator(value, resolved)
      : resolved;
  }

  resolve(definition) {
    const keys = Object.keys(this.values);
    const proxy = {};

    Object.keys(definition.deps).forEach(key => {
      const propName = key.replace(/^get/, '');

      if (!keys.includes(propName)) {
        throw new Error(`Missing '${propName}' dependency`);
      }

      Object.defineProperty(proxy, propName, {
        get: () => {
          if (!this.values[propName]) {
            throw new Error(`Value '${propName}' is not defined`);
          }

          if (!Injector.hasLocked(this.values[propName])) {
            const target = this.values[propName];
            const source = definition.deps[key].call(this, this.values);

            Injector.assign(target, this.unwrap(source));
          }

          return this.values[propName];
        },
      });
    });

    return definition.factory(proxy);
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
        target[propName] = this.resolve(value);
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
