const Resolver = require('../lib/resolver');
const Injector = require('../lib/injector');

const td = require('testdouble');
const expect = require('chai').expect;

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

function mockResolver(registry, fixedValues) {
  return {
    registry: {
      ...registry,
    },
    values: {
      ...values,
      ...fixedValues,
    },
    _hooks: {},
    _lock: {},
    decorate: Resolver.prototype.decorate,
    resolve: Resolver.prototype.resolve,
    unwrap: Resolver.prototype.unwrap,
    get: Resolver.prototype.get,
  };
}

describe('Resolver', () => {
  describe('constructor', () => {
    const fs = require('fs');
    const path = require('path');
    const glob = require('glob');

    let existsCallback;
    let globCallback;
    let loadCallback;

    beforeEach(() => {
      existsCallback = td.func('fs.existsSync');
      globCallback = td.func('glob.sync');
      loadCallback = td.func('Resolver.loadFile');
    });

    afterEach(() => {
      td.reset();
    });

    it('will collect a registry of modules when constructed', () => {
      const scanFiles = Resolver.scanFiles;

      td.replace(Resolver, 'loadFile', loadCallback);
      td.replace(fs, 'existsSync', existsCallback);
      td.replace(path, 'join', (...args) => args.join('/'));
      td.replace(glob, 'sync', globCallback);

      td.when(glob.sync('**/index.js', { cwd: '.', nosort: true }))
        .thenReturn([
          'Name/prop/method/index.js',
          'Example/index.js',
        ]);

      td.when(Resolver.loadFile('./Name/prop/method/index.js')).thenReturn(function method() {});
      td.when(Resolver.loadFile('./Example/index.js')).thenReturn(class Example {});

      const scope = scanFiles('.');

      expect(scope.values.Example).not.to.be.undefined;
      expect(scope.values.Name).not.to.be.undefined;
      expect(scope.registry.Example).not.to.be.undefined;
      expect(scope.registry.Name.prop.method).not.to.be.undefined;
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

    const exampleFunction = resolverInstance.get('ExampleFunction');

    expect(exampleFunction(42)).to.eql(42);

    expect(new exampleFunction().testSelf()).to.eql(ExampleFunction);

    expect(resolverInstance.get('ExampleObject').testString).to.eql('BAR');
    expect(resolverInstance.get('ExampleObject').testFunction()).to.eql(ExampleClass);
  });
});
