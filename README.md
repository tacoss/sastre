# Sastre

[![Build Status](https://travis-ci.org/pateketrueke/sastre.png?branch=next)](https://travis-ci.org/pateketrueke/sastre)
[![NPM version](https://badge.fury.io/js/sastre.png)](http://badge.fury.io/js/sastre)
[![Coverage Status](https://codecov.io/github/pateketrueke/sastre/coverage.svg?branch=next)](https://codecov.io/github/pateketrueke/sastre)
[![Known Vulnerabilities](https://snyk.io/test/npm/sastre/badge.svg)](https://snyk.io/test/npm/sastre)

![Sastre](s_needle.png)

```bash
$ npm install sastre --save
```

## Quick start

Please see the [example file](example/index.js) for a reference integration which includes:

- Support for `module-alias`
- Container interface for `models`:
  - `User` &mdash; Sequelize model
  - `Token` &mdash; ES6 class definition

> Also, you can execute `npm run test:example` to run their unit-tests.

## How it works?

The `Resolver` class will turn directories containing `index.js` files into object definitions.

```bash
$ tree example/src/api/models
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

As result you'll get the following module definition:

```js
const Token = require('./Token');
const add = require('./User/classMethods/add');

module.exports = {
  Token,
  User: {
    classMethods: {
      add,
    },
  },
};
```

Above:

- Index files are our _entry points_, even having tons of files, only indexes are taken into account to conform the object shape.
- Entry points can be skipped on _intermediate modules_ like `classMethods`.

> Nesting modules has no depth limits, you can produce almost any kind of object using this technique.

## Containers

An instantiated `Resolver` becomes a `container` instance, you name it:

```js
const { Resolver } = require('sastre');

const optionalHooks = {
  before(name, definition) {},
  after(name, definition) {},
};

const sourcesDirectory = `${__dirname}/lib`;

const container = new Resolver(sourcesDirectory, optionalHooks);
```

You can access found modules through the `get()` method:

```js
const Test = container.get('Test');
```

From this point you can start hacking happily.

## Providers

The `Injector` class is used to flag out any entry point that demands extra stuff.

Found `provider.js` files will be used to retrieve dependencies from the container:

```js
module.exports = {
  getAnything() { /* yes, it's empty; keep reading ;-) */ },
};
```

Above:

- Function names are used to retrieve dependencies from the container.
- It's OK if they're empty, but if you return any truthy value it'll be used in place.

On these cases, the `index.js` MUST exports a _function factory_ which will only receive the resolved dependencies.

```js
module.exports = ({ Anything }) =>
  function something() {
    return new Anything();
  };
```

Any returned value is placed into the final module definition, as their lexical scope makes this DI pattern works.

> Provider files are complementary, you're not required to use them to benefit from the `Resolver` implementation.

## Hooks

Modules resolved can be modified or replaced by custom decorators too.

&mdash; **before**

Once `Resolver.scanFiles()` is done, use this hook to modify or replace the original definition received.

&mdash; **after**

Once a definition is unwrapped through `container.get()` and still unlocked, use this hook to modify or replace the final definition built.

> Both operations will run once and only affect top-level definitions.

## FAQ's

### Why `module-alias/register`?

The main goal of this library is getting rid of `require` calls from a well-know architecture do we use.

We're also looking the benefits and pitfails beyond splitting everything into submodules.

But loading parent stuff for common fixtures it's still an issue, e.g. `../../../../`

> Should be enough to `require('@src/models/User/fixtures')` isn't it?

### Why `get<WHATEVER>`?

E.g. you want a `Session` object within a method.

Using `Session(container) { ... }` is not enough clear, becase `Session(container)` says nothing.

Instead, `getSession(container) { ... }` helps to understand the purpose of the method... effectively.

> The `get` prefix is always stripped out, so you can use `Session` or `getSession` and the identifier will remain the same. This is useful if you want to get simple values instead, e.g. `serviceLocator(container) { ... }`

### How compose stuff?

A nice way to build complex dependencies through `provider.js` files is:

```js
module.exports = {
  userRepo({ User, Repository, getSequelizeDatasource }) {
    const dbUser = new SequelizeDatasource(User);
    const repo = new Repository(dbUser);

    return repo;
  },
  getUser() {},
  getRepository() {},
  getSequelizeDatasource() {},
};
```

And then you can inject them, e.g.

```js
module.exports = ({ userRepo }) =>
  async function getUsers() {
    return await userRepo.findAll();
  };
```

### How inject classes?

The included example implements an [advanced container](example/src/container/controllers.js) for higher IoC composition.

Using the `Resolver.use()` method will automatically decorate any found classes injecting the first argument given.

> Actually we're just passing the main container down through sub containers, etc.
