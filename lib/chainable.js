class Chainable {
  constructor(context, middleware) {
    const chain = [];

    async function call(...args) {
      await chain.reduce((prev, cur) => {
        return prev.then(() => cur.call(context, ...args));
      }, Promise.resolve());
    }

    Object.keys(middleware).forEach(prop => {
      Object.defineProperty(call, prop, {
        enumerable: false,
        get: () => {
          chain.push(middleware[prop]);

          return call;
        },
      });
    });

    return call;
  }
}

module.exports = Chainable;
