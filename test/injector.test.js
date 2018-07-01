const Injector = require('../lib/injector');

const td = require('testdouble');
const expect = require('chai').expect;

describe('Injector', () => {
  describe('constructor', () => {
    it('just atore given factory and deps', () => {
      function dummy({ foo }) {
        return foo;
      }

      const test = new Injector(dummy, {
        foo() {
          return 42;
        },
      });

      expect(test.factory).not.to.be.undefined;
      expect(test.deps.foo).not.to.be.undefined;
    });
  });

  describe('hasLocked', () => {
    it('detects if values has injectables', () => {
      expect(Injector.hasLocked({})).to.be.false;
    });
  });

  describe('supports', () => {
    it('validates if values are injectables', () => {
      expect(Injector.supports(new Injector())).to.be.true;
    });
  });

  describe('assign', () => {
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
