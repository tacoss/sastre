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
        expect(() => new Chainable()).to.throw('Invalid middleware, given undefined');
      });

      it('should validate each given function', () => {
        expect(() => new Chainable(null, { undef: null })).to.throw('Invalid function, given null');
      });

      it('should validate each factory function given', () => {
        expect(() => new Chainable(null, {})(null)).to.throw('Invalid factory, given null');
      });
    });
  });

  describe('callable', () => {
    it('should inject chainable methods on call', async () => {
      const callable = td.func();

      const test = new Chainable(null, {
        a: callable,
        b: callable,
        c: callable,
      });

      await test(({ a }) => a.b.c)();

      expect(td.explain(callable).callCount).to.eql(3);
    });

    it('should invoke given middlewares in order', async () => {
      let values;
      let callCount;

      const inc = td.func();

      td.when(inc('A')).thenReturn(1);
      td.when(inc('B')).thenReturn(2);
      td.when(inc('C')).thenReturn(3);

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
        callCount += inc(value);
      }

      const test = new Chainable(null, {
        a: () => push('A'),
        b: () => push('B'),
        c: () => delay(100, () => push('C')),
      });

      reset();
      expect(test()).to.throw('Missing middleware to chain');
      expect(values).to.be.undefined;
      expect(callCount).to.be.undefined;
      expect(td.explain(inc).callCount).to.eql(0);

      reset();
      await test(({ a }) => a)();
      expect(callCount).to.eql(1);
      expect(values).to.eql(['A']);
      expect(td.explain(inc).callCount).to.eql(1);

      reset();
      await test(({ a }) => a.b)();
      expect(callCount).to.eql(3);
      expect(values).to.eql(['A', 'B']);
      expect(td.explain(inc).callCount).to.eql(3);

      reset();
      await test(({ a }) => a.c.b)();
      expect(callCount).to.eql(6);
      expect(values).to.eql(['A', 'C', 'B']);
      expect(td.explain(inc).callCount).to.eql(6);
    });

    it('can be called through container.get() resolution', async () => {
      const after = td.func();
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

      await container.get('dep1', after)();
      await container.get('dep1')(({ a }) => a)();
      await container.get('dep1')(({ a }) => a.b)();
      await container.get('dep1')(({ a }) => a.b.c)();

      expect(td.explain(after).callCount).to.eql(1);
      expect(td.explain(callable).callCount).to.eql(6);
    });
  });
});
