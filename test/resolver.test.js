/* eslint-disable no-unused-expressions */

const Resolver = require('../lib/resolver');
const Injector = require('../lib/injector');

const td = require('testdouble');
const expect = require('chai').expect;

/* global it, describe, beforeEach, afterEach */

class ExampleClass {
  constructor(anyInstance) {
    this.x = anyInstance;
  }
}

const ExampleObject = {
  test: -1,
};

function ExampleFunction(value) {
  return value;
}

const values = {
  ExampleClass,
  ExampleObject,
  ExampleFunction,
};

const injectables = {
  aNumber(container) {
    return container.aNumber;
  },
};

const validInjectables = {
  getExampleClass() {},
  getExampleObject() {},
  getExampleFunction() {},
};

function mockResolver(registry, fixedValues, fixedDependencies) {
  return {
    _dependencies: {
      ...fixedDependencies,
    },
    _decorator: {
      before: td.func('before'),
      after: td.func('after'),
    },
    _registry: {
      ...registry,
    },
    _values: {
      ...values,
      ...fixedValues,
    },
    _lock: {},
    unwrap: Resolver.prototype.unwrap,
    get: Resolver.prototype.get,
  };
}

describe('Resolver', () => {
  describe('static methods', () => {
    const fs = require('fs');
    const path = require('path');
    const glob = require('glob');

    let existsCallback;
    let globCallback;
    let loadCallback;

    beforeEach(() => {
      loadCallback = td.func('Resolver.loadFile');
      existsCallback = td.func('fs.existsSync');
      globCallback = td.func('glob.sync');

      td.replace(fs, 'existsSync', existsCallback);
      td.replace(path, 'join', (...args) => args.join('/'));
      td.replace(glob, 'sync', globCallback);
    });

    afterEach(() => {
      td.reset();
    });

    describe('constructor', () => {
      function Foo() {}
      const foo = () => 'BAR';
      const cwd = '.';

      let scanCallback;
      let decoratorInput;

      beforeEach(() => {
        scanCallback = td.func('Resolver.scanFiles');
        decoratorInput = td.matchers.isA(Function);

        td.replace(Resolver, 'loadFile', loadCallback);
        td.replace(Resolver, 'scanFiles', scanCallback);

        td.when(Resolver.scanFiles(cwd, decoratorInput))
          .thenReturn({
            registry: {
              foo,
            },
            values: {
              foo: Foo,
            },
          });
      });

      it('should work as expected', () => {
        expect(new Resolver(null, cwd)._registry).to.be.deep.eql({ foo });
      });

      it('can receive a function, it will be used as after-hook', () => {
        const callback = td.func('after-hook');
        const container = new Resolver(null, '.', callback);

        expect(container.get('foo')).to.eql(Foo);
        expect(td.explain(callback).callCount).to.eql(1);
      });
    });

    describe('use', () => {
      it('TODO', () => {});
    });

    describe('bind', () => {
      it('TODO', () => {});
    });

    describe('loadFile', () => {
      it('is just a wrapper for require() calls', () => {
        expect(Resolver.loadFile('util')).to.be.eql(require('util'));
      });
    });

    describe('scanFiles', () => {
      it('will collect a registry of modules when constructed', () => {
        td.when(glob.sync('**/index.js', { cwd: '.', nosort: true }))
          .thenReturn([
            'Name/prop/method/index.js',
            'Example/index.js',
          ]);

        td.replace(Resolver, 'loadFile', loadCallback);

        td.when(Resolver.loadFile('./Name/prop/method/index.js')).thenReturn(function method() {});
        td.when(Resolver.loadFile('./Example/index.js')).thenReturn(class Example {});

        const container = new Resolver(null, '.');

        expect(container._decorator.before).not.to.be.undefined;
        expect(container._decorator.after).not.to.be.undefined;
        expect(container._values.Example).not.to.be.undefined;
        expect(container._values.Name).not.to.be.undefined;
        expect(container._registry.Example).not.to.be.undefined;
        expect(container._registry.Name.prop.method).not.to.be.undefined;
      });
    });
  });

  it('will fail on missing values', () => {
    const resolverInstance = mockResolver({
      ExampleClass: {
        staticMethod: new Injector(() => function staticMethod() {}, injectables),
      },
    });

    expect(() => resolverInstance.get('ExampleClass')).to.throw("Missing 'aNumber' dependency");
  });

  it('will fail on non-injectable values', () => {
    const resolverInstance = mockResolver({
      aNumber: 42,
    }, {
      aNumber: 42,
    });

    expect(() => resolverInstance.get('aNumber')).to.throw("Target 'aNumber' is not an object, given '42'");
  });

  it('will resolve from rootContainer as fallback', () => {
    const resolverInstance = mockResolver(null, null, {
      theTruth() {
        return 42;
      },
    });

    expect(resolverInstance.get('theTruth')()).to.eql(42);
  });

  it('will resolve injectable values otherwise', () => {
    const resolverInstance = mockResolver({
      ExampleClass: {
        decoratedMethod: new Injector(({ ExampleObject: Eo }) => () => Eo, validInjectables),
      },
      ExampleObject: {
        testString: 'BAR',
        testFunction: new Injector(({ ExampleClass: Ex }) => () => Ex, validInjectables),
      },
      ExampleFunction: {
        prototype: {
          testSelf: new Injector(({ ExampleFunction: Fn }) => () => Fn, validInjectables),
        },
      },
    });

    expect(() => resolverInstance.get('ExampleClass').decoratedMethod().testFunction().decoratedMethod()).not.to.throw();

    const exampleClass = new (resolverInstance.get('ExampleClass'))(42);

    expect(exampleClass.x).to.eql(42);

    const Fn = resolverInstance.get('ExampleFunction');

    expect(Fn(42)).to.eql(42);

    expect(new Fn().testSelf()).to.eql(ExampleFunction);

    expect(resolverInstance.get('ExampleObject').testString).to.eql('BAR');
    expect(resolverInstance.get('ExampleObject').testFunction()).to.eql(ExampleClass);
  });
});
