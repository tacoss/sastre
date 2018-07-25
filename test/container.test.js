/* eslint-disable no-unused-expressions */

const Container = require('../lib/container');
const Injector = require('../lib/injector');

const td = require('testdouble');
const expect = require('chai').expect;

/* global it, describe, beforeEach, afterEach */

describe('Container', () => {
  describe('static methods', () => {
    describe('constructor', () => {
      it('just extends from given args', () => {
        expect(new Container(null, { a: 'b' })).to.be.eql({ a: 'b' });
      });
    });

    describe('unwrap', () => {
      let supportsCallback;
      let bindCallback;

      const props = {
        foo: {
          bar: {
            baz: null,
          },
        },
      };

      beforeEach(() => {
        supportsCallback = td.func('Injector.supports');
        bindCallback = td.func('Injector.bind');

        td.replace(Injector, 'supports', supportsCallback);
        td.replace(Injector, 'bind', bindCallback);
      });

      afterEach(() => {
        td.reset();
      });

      it('should resolve recursively', () => {
        const result = Container.unwrap(null, props);

        expect(() => {
          if (result.foo.bar.baz !== null) {
            throw new Error('Unexpected error');
          }
        }).not.to.throw();
      });

      it('should bind injected properties', () => {
        td.when(Injector.supports({ baz: null }))
          .thenReturn(true);

        td.when(Injector.bind(null, { baz: null }, td.matchers.anything()))
          .thenReturn({ baz: 42 });

        const result = Container.unwrap(null, props);

        expect(td.explain(Injector.supports).callCount).to.eql(2);
        expect(result).to.deep.eql({
          foo: {
            bar: {
              baz: 42,
            },
          },
        });
      });
    });
  });

  describe('instance methods', () => {
    function buildContainer({ resolverValues, injectableValues } = {}) {
      return new Container(null, {
        values: {
          ...resolverValues,
        },
        registry: {
          ...injectableValues,
        },
      });
    }

    describe('get', () => {
      let afterCallback;

      beforeEach(() => {
        afterCallback = td.func('decorator.after');
      });

      afterEach(() => {
        td.reset();
      });

      it('should fail on invalid values', () => {
        const TESTS = [
          [{}, 'foo', 'undefined'],
          [{ aNumber: 42 }, 'aNumber', '42'],
          [{ nullValues: null }, 'nullValues', 'null'],
          [{ stringValues: 'TEST' }, 'stringValues', "'TEST'"],
        ];

        TESTS.forEach(testInfo => {
          const [args, propName, givenValue] = testInfo;

          expect(() => {
            buildContainer({ resolverValues: args }).get(propName);
          }).to.throw(`Target '${propName}' is not an object, given ${givenValue}`);
        });
      });

      it('should keep locked values as-is', () => {
        const dep1 = {
          value: Symbol('UNIQUE_DEPENDENCY'),
        };

        td.replace(Injector, 'hasLocked', td.func('Injector.hasLocked'));
        td.when(Injector.hasLocked(dep1))
          .thenReturn(true);

        expect(buildContainer({ resolverValues: { dep1 } }).get('dep1')).to.deep.eql(dep1);
      });

      it('should resolve and lock values otherwise', () => {
        const dep1 = new Injector(({ Value }) => function method() {
          return new Value();
        }, {
          getValue() {},
        });

        const container = buildContainer({
          resolverValues: {
            dep1: {},
            Value: class {
              constructor() {
                this.value = 42;
              }
            },
          },
          injectableValues: {
            dep1,
          },
        });

        const resolver = {
          get: name => container.get(name, afterCallback),
          ...container,
        };

        const result = Injector.bind(resolver, dep1);

        expect(result()).to.eql({ value: 42 });
        expect(td.explain(afterCallback).callCount).to.eql(1);

        // should unlock decorated values once
        function Test() {}

        td.when(afterCallback('dep1', td.matchers.isA(Object)))
          .thenReturn(Test);

        expect(container._lock.dep1).to.be.undefined;
        expect(container.get('dep1', afterCallback)).to.eql(Test);
        expect(container._lock.dep1).to.be.false;
        expect(container.get('dep1', afterCallback)).to.eql(Test);
        expect(container._lock.dep1).to.be.true;

        expect(td.explain(afterCallback).callCount).to.eql(3);
      });

      it('should unwrap resolved Injector instances before any extension', () => {
        const injectedValue = new Injector(() => function test() {}, {});

        td.when(afterCallback('test', td.matchers.isA(Function)))
          .thenReturn(-1);

        const container = new Container(null, {
          values: {
            test: injectedValue,
            raw: Injector.Symbol,
          },
          registry: {
            test: {},
          },
        });

        const result = container.get('test', afterCallback);

        expect(td.explain(afterCallback).callCount).to.eql(1);
        expect(container.get('raw')).to.eql({});
        expect(result).to.eql(-1);
      });

      it('should report any failure during decoration', () => {
        expect(() => {
          new Container(null, {
            values: {
              undef: {},
            },
          }).get('undef');
        }).to.throw("Definition of 'undef' failed. Cannot read property 'undef' of undefined");
      });
    });
  });
});
