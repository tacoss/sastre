<div align="center">

![Sastre](s_needle.svg)

[![Build status](https://github.com/tacoss/sastre/workflows/ci/badge.svg)](https://github.com/tacoss/sastre/actions)
[![NPM version](https://badge.fury.io/js/sastre.svg)](http://badge.fury.io/js/sastre)
[![Coverage Status](https://codecov.io/github/tacoss/sastre/coverage.svg?branch=master)](https://codecov.io/github/tacoss/sastre)
[![Known Vulnerabilities](https://snyk.io/test/npm/sastre/badge.svg)](https://snyk.io/test/npm/sastre)

</div>

Install with npm:

```bash
$ npm install sastre --save
```

Or yarn:

```bash
$ yarn add sastre
```

## Quick start

Please see the [example file](example/index.js) for a reference integration which includes:

- Support for `module-alias`
- Container interface for `models`:
  - `User` &mdash; Sequelize model
  - `Token` &mdash; ES6 class definition
- Container interface for `controllers` :
  - `UserController` &mdash; GRPC controller

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

As result you'll get _approximately_ the following module definition:

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

Since `0.1.1` module and method names are converted from `dash-case` to `PascalCase` and `camelCase` respectively. This would help to alleviate issues with case-sensitiveness on some environments, especially when doing cross-environment development, e.g. Linux vs OSx.

## Containers

An instantiated `Resolver` becomes a `container` instance, you name it:

```js
const { Resolver } = require('sastre');

const optionalHooks = {
  before(name, definition) {},
  after(name, definition) {},
};

const sourcesDirectory = `${__dirname}/lib`;

const container = new Resolver(null, sourcesDirectory, optionalHooks);
```

You can access found modules through the `get()` method:

```js
const Test = container.get('Test');
```

From this point you can start hacking happily.

## Providers

The `Injector` class is used to flag out any entry point that demands extra stuff.

Any found `provider.js` files will be used to retrieve dependencies from the container:

```js
module.exports = {
  getAnything() { /* yes, it's empty; keep reading ;-) */ },
  getFromContainer() {
    // `this` is null here due `new Resolver(null, ...)`
    return this;
  },
};
```

Above:

- Function names are used to retrieve dependencies from the container.
- It's OK if they're empty, but if you return any truthy value it'll be used in place.
- Provider functions can access the context given on `new Resolver()` instantiation.

Now, `index.js` MUST exports a _function factory_ which will only receive the resolved dependencies.

```js
module.exports = ({ Anything }) =>
  function something() {
    return new Anything();
  };
```

> Please use arrow-functions to inject values ase they're detected for this purpose, regular functions will not work.

Any returned value is placed into the final module definition, as their lexical scope makes this DI pattern works.

This would work for any kind of methods, even those from `prototype`.

## Hooks

Modules resolved can be modified or replaced by custom decorators too.

&mdash; **before**

Once `Resolver.scanFiles()` is done, use this hook to modify or replace the original definition received.

> During this hook you can access the original class if given, without instantiate.

&mdash; **after**

Once a definition is unwrapped through `container.get()` and still unlocked, use this hook to modify or replace the final definition built.

> Here you can access the instantiated class if given, partially injected. In this step you can perform property-injection based on your needs.

## FAQ's

### Why `module-alias/register`?

The main goal of this library is getting rid of `require` calls from a well-know architecture do we use.

We're also looking the benefits and pitfalls beyond splitting everything into submodules.

But loading parent stuff for common fixtures it's still an issue, e.g. `../../../../`

> Should be enough to `require('@src/models/User/fixtures')` isn't it?

### Why `get<WHATEVER>`?

E.g. you want a `Session` object within a method.

Using `Session() { ... }` is not enough clear, because `Session()` says nothing.

Instead, `getSession() { ... }` helps to understand the purpose of the method... effectively.

> The `get` prefix is always stripped out, so you can use `Session` or `getSession` and the identifier will remain the same. This is useful if you want to get simple values instead, e.g. `serviceLocator() { ... }`

### How compose stuff?

A nice way to build complex dependencies through `provider.js` files is:

```js
module.exports = {
  userRepo({ User, Repository, SequelizeDatasource }) {
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

ES6 classes are automatically decorated to receive all provided dependencies.

> You can access other containers through the root-container, it is given as `this` on all providers.

### What are root-providers?

Individual `provider.js` files are intended to decorate in-place methods or whole containers.

So, placing `provider.js` files in the same directory where modules are scanned is enough to serve as defaults, e.g.

```bash
$ tree example/src/api/controllers
├── UserController
│   └── index.js
└── provider.js

1 directory, 2 files
```

### What are chainables?

The `Chainable` class lets you do things like this:

```js
const run = new Chainable(null, {
  async test() {
    return Promise.resolve(42);
  },
  anythingElse() {
    console.log('OK');
  },
});

await run($ => $.test.anythingElse());
await run($ => $.anythingElse.test());
await run(({ test }) => test.anythingElse());
await run(({ anythingElse }) => anythingElse.test());
```

> This would help you to chain functions in order, both sync or async are supported.

### It's possible to use TypeScript?

Yes, basic support for `.d.ts` files is built-in, just call `Resolve.typesOf(container)` to get an array of the samples.

Each sample contains a `chunk`, a string containing the type definition, and optionally a `type` property that contains the module name, e.g.

```js
const buffer = Resolver.typesOf(container).map(x => (x.type ? [`// ${x.type}`] : []).concat(x.chunk).join('\n')).join('\n');
```

The resulting `buffer` should be something like this:

```ts
import TestSubNestedModule from './Test/sub/nested';
import TestSubModule from './Test/sub';
import ExampleModule from './Example';
interface TestModule {}
interface OtherTestWithDashesAndModule {}
interface NamePropInjectableMethodModule {}
interface NamePropMethodModule {}
// Example
export interface ExampleInterface extends ExampleModule {}
// Test
export interface TestInterface extends TestModule {
  sub: typeof TestSubModule & {
    nested: typeof TestSubNestedModule
  }
}
// OtherTest
export interface OtherTestInterface {
  withDashesAnd: typeof OtherTestWithDashesAndModule
}
// Name
export interface NameInterface {
  prop: {
    injectableMethod: typeof NamePropInjectableMethodModule
    method: typeof NamePropMethodModule
  }
}
```

This way you can write your modules using TypeScript, just make sure you're emitting the definitions in the same place as the generated `.js` files.

> Paths are resolved from the `cwd` of the given container, so you must save this file in the same directory to resolve their `import` calls.
