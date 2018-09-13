'use strict';

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
    it('should inject chainable methods on call', () => {
      const callable = td.func();

      const test = new Chainable(null, {
        a: callable,
        b: callable,
        c: callable,
      });

      return test(ctx => ctx.a.b.c()).then(() => {
        expect(td.explain(callable).callCount).to.eql(3);
      });
    });

    it('should invoke given middlewares in order', () => {
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
      expect(values).to.be.undefined;
      expect(callCount).to.be.undefined;
      expect(td.explain(inc).callCount).to.eql(0);

      return Promise.resolve()
        .then(() => reset() || test(ctx => ctx.a()))
        .then(() => {
          expect(callCount).to.eql(1);
          expect(values).to.eql(['A']);
          expect(td.explain(inc).callCount).to.eql(1);
        })
        .then(() => reset() || test(ctx => ctx.a.b()))
        .then(() => {
          expect(callCount).to.eql(3);
          expect(values).to.eql(['A', 'B']);
          expect(td.explain(inc).callCount).to.eql(3);
        })
        .then(() => reset() || test(ctx => ctx.a.c.b()))
        .then(() => {
          expect(callCount).to.eql(6);
          expect(values).to.eql(['A', 'C', 'B']);
          expect(td.explain(inc).callCount).to.eql(6);
        });
    });

    it('can be called through container.get() resolution', () => {
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

      return Promise.all([
        container.get('dep1', after),
        container.get('dep1')(ctx => ctx.a()),
        container.get('dep1')(ctx => ctx.a.b()),
        container.get('dep1')(ctx => ctx.a.b.c()),
      ]).then(() => {
        expect(td.explain(after).callCount).to.eql(1);
        expect(td.explain(callable).callCount).to.eql(6);
      });
    });

    it('should throw if anything rejects inside', () => {
      function factory() {
        function foo() {
          return Promise.reject(new Error('Oh noes!'));
        }

        return new Chainable(null, {
          bar(req, args) {
            return Promise.resolve()
              .then(() => foo(req, args))
              .then(() => {
                throw new Error('IT_SHALL_NOT_PASS');
              });
          },
          foo,
        });
      }

      const use = factory();

      let err;

      return Promise.resolve()
        .then(() => use(({ bar }) => bar({ baz: 'buzz' })))
        .catch(e => {
          err = e;
        })
        .then(() => {
          expect(err).to.match(/Oh noes!/);
        });
    });
  });
});
