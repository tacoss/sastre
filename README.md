# Work in progress...

Currently this module is not available at NPM, however you can install it through Git, e.g.

```bash
$ npm install agave/di-container --save
```

## Quick start

Please see the [example.js]() file for a reference integration which includes:

- Support for `module-alias`
- Container interface for `models`:
  - `User` &mdash; Sequelize model
  - `Token` &mdash; ES6 class definition

> Also, you can execute `npm run test:example` to run their unit-tests.

## How it works?

The `Resolver` class will turn directories containing `index.js` files into object definitions.

```bash
$ tree src/api/models
├── Token
│   └── index.js
└── User
    ├── classMethods
    │   └── add
    │       ├── index.js
    │       ├── index.test.js
    │       └── provider.js
    └── index.js

4 directories, 5 files
```

As result, you'll get the following module definition:

```js
const TokenClass = require('./Token');
const addMethod = require('./User/classMethods/add');

module.exports = {
  Token: TokenClass,
  User: {
    classMethods: {
      add: addMethod,
    },
  },
};
```

Above:

- Index files are our _entry points_, even having tons of files, only indexes are taken into account to conform the object shape.
- Entry points can be skipped on _intermediate modules_ like `classMethods`.

> Nesting modules has no depth limits, you can produce almost any kind of object using this technique.

## Provider files

The `Injector` class is used to flag out any entry point that demands extra stuff.

Once a `provider.js` file is loaded, it’ll be used to retrieve dependencies from the container.

```js
module.exports = {
  getAnything(container) {
    return container.Anything;
  },
};
```

On these cases, the `index.js` MUST exports a _function factory_ which will only receive the resolved dependencies.

```js
module.exports = ({ Anything }) =>
  function something() {
    return new Anything();
  };
```

Any returned value is placed into the final module definition, as their lexical scope makes this DI pattern works.

> Provider files are complementary, you're not required to use them to benefit from the `Resolver` implementation.

## FAQ's

### Why `get<WHATEVER>`?

E.g. you want a `Session` object within a method.

Using `Session(container) { ... }` is not enough clear, becase `Session(container)` says nothing.

Instead, `getSession(container) { ... }` helps to understand to purpose of the method.

> The `get` prefix is always stripped out, so you can use `Session` or `getSession` and the identifier will remain the same.
