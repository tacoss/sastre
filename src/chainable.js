import { inspect } from 'util';
import Exception from './exception';

export default class Chainable {
  constructor(context, middleware) {
    if (!middleware || Array.isArray(middleware) || typeof middleware !== 'object') {
      throw new Exception(`Invalid middleware, given ${inspect(middleware)}`);
    }

    let chain = [];

    function factory() {
      if (!chain.length) {
        throw new Exception('Missing middleware to chain');
      }

      return chain.reduce((prev, cur) => prev.then(() => cur.apply(context, arguments)), Promise.resolve());
    }

    Object.keys(middleware).forEach(prop => {
      if (typeof middleware[prop] !== 'function') {
        throw new Exception(`Invalid function for '${prop}', given ${inspect(middleware[prop])}`);
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

      let deferred = Promise.resolve();

      Array.prototype.slice.call(arguments).forEach(cb => {
        if (typeof cb !== 'function') {
          throw new Exception(`Invalid factory, given ${inspect(cb)}`);
        }

        deferred = cb(factory) || deferred;
      });

      return deferred;
    };
  }
}
