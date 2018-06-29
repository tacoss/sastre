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
  aNumber(resolver) {
    return resolver.aNumber;
  },
};

const validInjectables = {
  getExampleClass(container) {
    return container.ExampleClass;
  },
  getExampleObject(container) {
    return container.ExampleObject;
  },
  getExampleFunction(container) {
    return container.ExampleFunction;
  },
};

const proxy = value => value;

function makeInjectable(factory, injectables, dependencies) {
  const injectable = new Injector(factory, injectables);

  const resolver = {
    values: {
      ...dependencies,
    },
    unwrap: td.func('resolver.unwrap'),
  };

  return { injectable, resolver };
}

describe('Injector', () => {
  it('will fail on missing values', () => {
    const { injectable, resolver } = makeInjectable(proxy, injectables, {});

    expect(() => injectable.unwrap(resolver).aNumber).to.throw("Missing 'aNumber' dependency");
  });

  it('will fail on non-injectable values', () => {
    const invalidDependencies = {
      aNumber: 42,
    };

    const { injectable, resolver } = makeInjectable(proxy, injectables, invalidDependencies);

    expect(() => injectable.unwrap(resolver).aNumber).to.throw("Target is not an object, given '42'");
  });

  it('will resolve injectable values otherwise', () => {
    const classDependencies = {
      ...values,
      aNumber: 42,
    };

    const classInjectables = {
      ...injectables,
      ...validInjectables,
    };

    const { injectable, resolver } = makeInjectable(proxy, classInjectables, classDependencies);

    td.when(resolver.unwrap(ExampleClass)).thenReturn({ get value() { return null; } });
    td.when(resolver.unwrap(ExampleObject)).thenReturn({ extra: 'VALUE' });
    td.when(resolver.unwrap(ExampleFunction)).thenReturn({ prototype: { test() { return 'OK'; } } });

    const container = injectable.unwrap(resolver);
    const Example = container.ExampleClass;
    const example = container.ExampleObject;

    expect(Example.value).to.be.null;
    expect(Example).to.eql(ExampleClass);
    expect(new Example(example).x).to.eql({ test: -1, extra: 'VALUE' });

    const fn = container.ExampleFunction;

    expect(fn(true)).to.be.true;
    expect(fn.prototype.test()).to.eql('OK');
  });

  // hasLocked(target)
  // supports(target)

  // assign(target, extensions)
  // cannot assign twice

  // resolve(resolver)
  // won't unwrap twice
});
