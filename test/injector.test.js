/* eslint-disable no-unused-expressions */

const Injector = require('../lib/injector');

const expect = require('chai').expect;

/* global it, describe, beforeEach */

describe('Injector', () => {
  describe('constructor', () => {
    const someInjectables = {
      dep1() {
        return 42;
      },
    };

    let fakeResolver;

    beforeEach(() => {
      fakeResolver = {
        _values: {
          dep1: {},
        },
        _dependencies: {},
      };
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
        constructor({ dep1 }) {
          this.dep = dep1;
        }
      }

      const testClass = new Injector(Test, someInjectables);
      const result = Injector.bind(fakeResolver, testClass);

      expect(result).to.deep.eql({ dep: 42 });
    });

    it('arrow functions are used to inject values', () => {
      const testArrow = new Injector(({ dep1 }) => () => dep1, someInjectables);
      const result = Injector.bind(fakeResolver, testArrow);

      expect(result()).to.eql(42);
    });
  });

  describe('hasLocked', () => {
    it('detects if values has injectables', () => {
      expect(Injector.hasLocked({})).to.be.false;
    });
  });

  describe('supports', () => {
    it('validates if values are injectables', () => {
      expect(() => Injector.supports(new Injector())).to.throw('Cannot inject non-callable values');
    });
  });

  describe('assign', () => {
    it('should fail on unexpected values', () => {
      expect(() => {
        Injector.assign();
      }).to.throw("Target is not an object, given 'undefined'");
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
});
