'use strict';

const ScopeError = require('./scope-error');
const inspect = require('util').inspect;

class Chainable {
  constructor(context, middleware) {
    if (!middleware || Array.isArray(middleware) || typeof middleware !== 'object') {
      throw new ScopeError(`Invalid middleware, given ${inspect(middleware)}`);
    }

    let chain = [];

    function factory() {
      if (!chain.length) {
        throw new ScopeError('Missing middleware to chain');
      }

      return chain.reduce((prev, cur) => {
        return prev.then(() => cur.apply(context, arguments));
      }, Promise.resolve());
    }

    Object.keys(middleware).forEach(prop => {
      if (typeof middleware[prop] !== 'function') {
        throw new ScopeError(`Invalid function, given ${inspect(middleware[prop])}`);
      }

      Object.defineProperty(factory, prop, {
        enumerable: false,
        get: () => {
          chain.push(middleware[prop]);

          return factory;
        },
      });
    });

    return function call() {
      chain = [];

      Array.prototype.slice.call(arguments).forEach(cb => {
        if (typeof cb !== 'function') {
          throw new ScopeError(`Invalid factory, given ${inspect(cb)}`);
        }

        cb(factory);
      });

      return factory;
    };
  }
}

module.exports = Chainable;
