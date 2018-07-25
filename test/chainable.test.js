/* eslint-disable no-unused-expressions */

const Chainable = require('../lib/chainable');
const Container = require('../lib/container');

const expect = require('chai').expect;
const td = require('testdouble');

/* global it, describe */

describe('Chainable', () => {
  describe('static methods', () => {
    describe('constructor', () => {
      it('should validate its input', () => {
        expect(() => new Chainable().call()).to.throw('Invalid middleware, given undefined');
      });

      it('should validate each given function', () => {
        expect(() => new Chainable(null, { undef: null }).call()).to.throw('Invalid function, given null');
      });
    });

    describe('supports', () => {
      it('validates if values are chainables', () => {
        expect(Chainable.supports()).to.be.false;
      });
    });
  });

  describe('instance methods', () => {
    describe('call', () => {
      it('should invoke given middlewares in order', async () => {
        let values;
        let callCount;

        function delay(ms, cb) {
          return new Promise(resolve => setTimeout(() => resolve(cb()), ms));
        }

        function reset() {
          values = undefined;
          callCount = undefined;
        }

        function push(value) {
          values = values || [];
          values.push(value);

          callCount = callCount || 0;
          callCount += 1;
        }

        const test = new Chainable(null, {
          a: () => push('A'),
          b: () => push('B'),
          c: () => delay(100, () => push('C')),
        });

        reset();
        await test.call();
        expect(values).to.be.undefined;
        expect(callCount).to.be.undefined;

        reset();
        await test.call.a();
        expect(callCount).to.eql(1);
        expect(values).to.eql(['A']);

        reset();
        await test.call.a.c.b();
        expect(callCount).to.eql(3);
        expect(values).to.eql(['A', 'C', 'B']);
      });

      it('can be called through container.get() resolution', async () => {
        const afterCallback = td.func();
        const callable = td.func();

        const container = new Container(null, {
          values: {
            dep1: new Chainable(null, {
              a: callable,
              b: callable,
              c: callable,
            }),
          },
          registry: {
            dep1: {},
          },
        });

        await container.get('dep1', afterCallback)();
        await container.get('dep1', afterCallback).a();
        await container.get('dep1', afterCallback).a.b();
        await container.get('dep1', afterCallback).b.b.c();

        expect(td.explain(callable).callCount).to.eql(6);
        expect(td.explain(afterCallback).callCount).to.eql(0);
      });
    });
  });
});
