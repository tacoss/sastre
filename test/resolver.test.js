/* eslint-disable no-unused-expressions */

const Resolver = require('../lib/resolver');

const td = require('testdouble');
const expect = require('chai').expect;

/* global it, describe, beforeEach, afterEach */

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
        expect(new Resolver(cwd)._container.registry).to.be.deep.eql({ foo });
        expect(new Resolver(cwd)._container.values).to.be.deep.eql({ foo: Foo });
      });

      it('can receive context as first arg', () => {
        expect(() => new Resolver(null, cwd)).not.to.throw();
      });

      it('can use any given callback as after-decorator', () => {
        expect(new Resolver(cwd, () => -1)._decorators.after()).to.eql(-1);
      });
    });

    describe('useFile', () => {
      // FIXME: test for fs.exists() and loadFile() call
      it('can return dependencies if provider file exists', () => {
        td.replace(Resolver, 'loadFile', loadCallback);

        td.when(fs.existsSync('Test/index.js'))
          .thenReturn(true);

        Resolver.useFile('Test/index.js');

        expect(td.explain(loadCallback).callCount).to.eql(1);
      });
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
            'Name/prop/injectableMethod/index.js',
            'Name/prop/method/index.js',
            'Example/index.js',
            'Test/index.js',
            'Test/sub/index.js',
            'Test/sub/nested/index.js',
          ]);

        td.replace(Resolver, 'loadFile', loadCallback);

        td.when(Resolver.loadFile('./Name/prop/injectableMethod/index.js')).thenReturn(({ undef }) => () => undef);
        td.when(Resolver.loadFile('./Name/prop/method/index.js')).thenReturn(function method() {});
        td.when(Resolver.loadFile('./Example/index.js')).thenReturn(class Example {});
        td.when(Resolver.loadFile('./Test/index.js')).thenReturn({});
        td.when(Resolver.loadFile('./Test/sub/index.js')).thenReturn(function sub() {});
        td.when(Resolver.loadFile('./Test/sub/nested/index.js')).thenReturn(function nested() {});

        const container = new Resolver('.');

        expect(container._decorators.before).not.to.be.undefined;
        expect(container._decorators.after).not.to.be.undefined;
        expect(container._container.values.Example).not.to.be.undefined;
        expect(container._container.values.Name).not.to.be.undefined;
        expect(container._container.registry.Example).not.to.be.undefined;
        expect(container._container.registry.Name.prop.injectableMethod).not.to.be.undefined;
        expect(container._container.registry.Name.prop.method).not.to.be.undefined;
      });

      it('can skip the after-callback', () => {
        td.when(glob.sync('**/index.js', { cwd: '.', nosort: true }))
          .thenReturn([
            'Test/index.js',
          ]);

        td.replace(Resolver, 'loadFile', loadCallback);

        td.when(Resolver.loadFile('./Test/index.js')).thenReturn(class Test {});

        expect(() => Resolver.scanFiles('.')).not.to.throw();
      });
    });
  });

  describe('instance methods', () => {
    let scanCallback;
    let getCallback;
    let _container;

    beforeEach(() => {
      scanCallback = td.func('Resolver.scanFiles');
      getCallback = td.func('container.get');

      td.replace(Resolver, 'scanFiles', scanCallback);
      td.when(Resolver.scanFiles('.', td.matchers.anything()))
        .thenReturn({
          values: -1,
          registry: -1,
        });

      _container = {
        get: getCallback,
        values: 'OK',
        registry: 'OK',
      };
    });

    afterEach(() => {
      td.reset();
    });

    describe('get', () => {
      it('can access container values', () => {
        expect(() => Resolver.prototype.get.call({
          _decorators: {},
          _container,
        })).not.to.throw();

        expect(td.explain(getCallback).callCount).to.eql(1);
      });

      it('should report any failure', () => {
        expect(() => Resolver.prototype.get()).to.throw();
      });
    });

    describe('get values', () => {
      it('should access container', () => {
        expect(new Resolver('.').values).to.eql(-1);
      });
    });

    describe('get registry', () => {
      it('should access container', () => {
        expect(new Resolver('.').registry).to.eql(-1);
      });
    });
  });
});
