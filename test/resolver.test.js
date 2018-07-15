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
            'Name/prop/method/index.js',
            'Example/index.js',
          ]);

        td.replace(Resolver, 'loadFile', loadCallback);

        td.when(Resolver.loadFile('./Name/prop/method/index.js')).thenReturn(function method() {});
        td.when(Resolver.loadFile('./Example/index.js')).thenReturn(class Example {});

        const container = new Resolver('.');

        expect(container._decorators.before).not.to.be.undefined;
        expect(container._decorators.after).not.to.be.undefined;
        expect(container._container.values.Example).not.to.be.undefined;
        expect(container._container.values.Name).not.to.be.undefined;
        expect(container._container.registry.Example).not.to.be.undefined;
        expect(container._container.registry.Name.prop.method).not.to.be.undefined;
      });
    });
  });
});
