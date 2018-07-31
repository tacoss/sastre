'use strict';

const inspect = require('util').inspect;

class Chainable {
  constructor(context, middleware) {
    if (!middleware || Array.isArray(middleware) || typeof middleware !== 'object') {
      throw new Error(`Invalid middleware, given ${inspect(middleware)}`);
    }

    let chain = [];

    function factory() {
      if (!chain.length) {
        throw new Error('Missing middleware to chain');
      }

      return chain.reduce((prev, cur) => {
        return prev.then(() => cur.apply(context, arguments));
      }, Promise.resolve());
    }

    Object.keys(middleware).forEach(prop => {
      if (typeof middleware[prop] !== 'function') {
        throw new Error(`Invalid function, given ${inspect(middleware[prop])}`);
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
          throw new Error(`Invalid factory, given ${inspect(cb)}`);
        }

        cb(factory);
      });

      return factory;
    };
  }
}

module.exports = Chainable;
