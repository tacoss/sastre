const Injector = require('./injector');

const glob = require('glob');
const path = require('path');
const fs = require('fs');

class Resolver {
  constructor(cwd, decorator) {
    const entryFiles = glob
      .sync('**/index.js', { cwd, nosort: true })
      .sort((a, b) => a.split('/').length - b.split('/').length);

    this.decorator = typeof decorator !== 'function'
      ? ((name, definition) => definition)
      : decorator;

    this.registry = {};
    this.classes = {};

    entryFiles.forEach(entry => {
      const [ className, ...properties ] = entry.split('/');
      const definition = require(path.join(cwd, entry));

      properties.pop();

      const providerFile = path.join(cwd, className, properties.join('/'), 'provider.js');
      const hasDependencies = fs.existsSync(providerFile);

      if (!this.classes[className]) {
        this.classes[className] = !properties.length ? definition : {};
      }

      this.registry[className] = this.registry[className] || {};

      let target = this.registry[className];
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

  unwrap(definition) {
    if (!definition || typeof definition === 'function') {
      return definition;
    }

    const target = {};

    if (Array.isArray(definition)) {
      return definition.map(x => this.unwrap(x));
    }

    Object.keys(definition).forEach(propName => {
      const value = definition[propName];

      if (Injector.supports(value)) {
        target[propName] = value.resolve(this);
      } else {
        target[propName] = this.unwrap(definition[propName]);
      }
    });

    return target;
  }

  get(className) {
    const ResolvedClass = this.classes[className];

    if (!Injector.hasLocked(ResolvedClass)) {
      const extensions = this.unwrap(this.registry[className]);

      Injector.assign(ResolvedClass, extensions);

      const DecoratedClass = this.decorator(className, ResolvedClass);

      if (DecoratedClass) {
        this.classes[className] = DecoratedClass;

        return DecoratedClass;
      }
    }

    return ResolvedClass;
  }
}

module.exports = Resolver;
