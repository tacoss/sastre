const { inspect } = require('util');

class Chainable {
  constructor(context, middleware) {
    if (!middleware || Array.isArray(middleware) || typeof middleware !== 'object') {
      throw new Error(`Invalid middleware, given ${inspect(middleware)}`);
    }

    Object.defineProperty(this, '_hooks', {
      enumerable: false,
      value: middleware,
    });

    Object.defineProperty(this, '_root', {
      enumerable: false,
      value: context,
    });
  }

  static supports(target) {
    return target instanceof Chainable;
  }

  get call() {
    const chain = [];

    function factory(...args) {
      return chain.reduce((prev, cur) => {
        return prev.then(() => cur.call(this._root, ...args));
      }, Promise.resolve());
    }

    Object.keys(this._hooks).forEach(prop => {
      if (typeof this._hooks[prop] !== 'function') {
        throw new Error(`Invalid function, given ${inspect(this._hooks[prop])}`);
      }

      Object.defineProperty(factory, prop, {
        enumerable: false,
        get: () => {
          chain.push(this._hooks[prop]);

          return factory;
        },
      });
    });

    return factory;
  }
}

module.exports = Chainable;
