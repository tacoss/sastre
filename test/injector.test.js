'use strict';

/* eslint-disable no-unused-expressions */
/* eslint-disable no-eval */

const Injector = require('../lib/injector');

const expect = require('chai').expect;
const td = require('testdouble');

/* global it, describe, afterEach, beforeEach */

describe('Injector', () => {
  describe('static methods', () => {
    describe('constructor', () => {
      it('should fail on invalid values', () => {
        expect(() => new Injector()).to.throw('Cannot inject non-callable values');
        expect(() => new Injector(function noop() {})).to.throw('Invalid injectables, given undefined');
      });

      if (parseFloat(process.version.substr(1)) >= 6) {
        it('should skip async functions as injectors', () => {
          expect(() => new Injector(eval('(async () => null)'), {})._factory()).not.to.throw();
        });
      }
    });

    describe('hasLocked', () => {
      it('detects if values has injectables', () => {
        expect(Injector.hasLocked({})).to.be.false;
      });
    });

    describe('supports', () => {
      it('validates if values are injectables', () => {
        expect(Injector.supports()).to.be.false;
      });
    });

    describe('assign', () => {
      it('should fail on unexpected values', () => {
        expect(() => {
          Injector.assign();
        }).to.throw('Target is not an object, given undefined');
      });

      it('can assign and lock injectables once', () => {
        const target = {};

        Injector.assign(target, {
          foo: 'BAR',
        });

        expect(target).to.be.deep.eql({
          foo: 'BAR',
        });

        expect(() => Injector.assign(target, {
          baz: 'BUZZ',
        })).to.throw('Cannot assign to locked values');
      });
    });

    describe('bind', () => {
      const someInjectables = {
        dep1() {},
        dep2() {
          return 'OK';
        },
      };

      let fakeResolver;
      let getCallback;

      beforeEach(() => {
        getCallback = td.func('resolver.get');

        fakeResolver = {
          get: getCallback,
          values: {
            dep1: {},
            dep2: {},
          },
        };

        td.when(fakeResolver.get('dep1', td.matchers.anything()))
          .thenReturn(-42);
      });

      afterEach(() => {
        td.reset();
      });

      it('will return plain functions as is', () => {
        function test() {
          return 42;
        }

        const testFn = new Injector(test, someInjectables);
        const result = Injector.bind(fakeResolver, testFn)();

        expect(result).to.eql(42);
      });

      it('will return instantiated classes bound', () => {
        class Test {
          constructor(ctx) {
            this.dep = ctx.dep1;
          }
        }

        const testClass = new Injector(Test, someInjectables);
        const result = Injector.bind(fakeResolver, testClass);

        expect(result).to.deep.eql({ dep: -42 });
        expect(td.explain(getCallback).callCount).to.eql(1);
      });

      it('arrow functions are used to inject values', () => {
        const testArrow = new Injector(ctx => () => ctx.dep1, someInjectables);
        const result = Injector.bind(fakeResolver, testArrow);

        expect(result()).to.eql(-42);
        expect(td.explain(getCallback).callCount).to.eql(1);
      });

      it('would return values given from injectors (if any)', () => {
        const testArrow = new Injector(ctx => () => ctx.dep2, someInjectables);
        const result = Injector.bind(fakeResolver, testArrow);

        expect(result()).to.eql('OK');
        expect(td.explain(getCallback).callCount).to.eql(0);
      });

      it('should fail on missing dependencies', () => {
        expect(() => {
          Injector.bind(fakeResolver, new Injector(() => null, { undef() {} }));
        }).to.throw("Missing 'undef' dependency");
      });

      it('should fail on missing values', () => {
        expect(() => {
          Injector.bind({
            values: {
              dep1: null,
            },
          }, new Injector(() => null, { dep1() {} }));
        }).to.throw("Value 'dep1' is not defined");
      });

      it('should fail if given provider is not a function', () => {
        expect(() => {
          Injector.bind({
            values: {
              dep1() {},
            },
          }, new Injector(() => null, { dep1: NaN }));
        }).to.throw('Invalid resolver, given NaN');
      });

      it('should fail if proxy cannot resolve the given provider', () => {
        expect(() => {
          Injector.bind({
            values: {
              dep1() {},
              undef() {},
            },
          }, new Injector(ctx => ctx.undef, { dep1() {} }));
        }).to.throw("Missing 'undef' provider");
      });

      it('should resolve again if getters are given', () => {
        const dep1Callback = td.func();
        const dep2Callback = td.func();

        td.when(dep1Callback()).thenReturn('ONE');
        td.when(dep2Callback()).thenReturn('TWO');

        // sadly, destructuring happens once and live-getters won't work...
        const proxyFn = new Injector(ctx => () => {
          return [ctx.dep1 && ctx.dep1, ctx.dep2 && ctx.dep2];
        }, {
          dep1() {
            return dep1Callback();
          },
          get dep2() {
            return dep2Callback();
          },
        });

        const result = Injector.bind({
          get: getCallback,
          values: {
            dep1: {},
            dep2: {},
          },
        }, proxyFn)();

        expect(result).to.eql(['ONE', 'TWO']);
        expect(td.explain(dep1Callback).callCount).to.eql(1);
        expect(td.explain(dep2Callback).callCount).to.eql(2);
      });
    });

    describe('use', () => {
      const fakeResolver = {
        _root: null,
      };

      it('should resolve and memoize dependencies once', () => {
        const factoryCalback = td.func('fooBar');

        const fakeDefinition = {
          _dependencies: {
            fooBar: factoryCalback,
          },
          _factory: props => [props.fooBar, props.fooBar],
        };

        Injector.use(fakeResolver, fakeDefinition);

        expect(td.explain(factoryCalback).callCount).to.eql(1);
      });

      it('should fail on invalid resolvers', () => {
        const fakeDefinition = {
          _dependencies: {
            fooBar: {},
          },
          _factory: ctx => [ctx.fooBar],
        };

        expect(() => {
          Injector.use(fakeResolver, fakeDefinition);
        }).to.throw('Invalid resolver, given {}');
      });
    });
  });
});
