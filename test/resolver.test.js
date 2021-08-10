import td from 'testdouble';
import { expect } from 'chai';

/* eslint-disable no-unused-expressions */

import Resolver from '../src/resolver';

/* global it, describe, beforeEach, afterEach */

describe('Resolver', () => {
  afterEach(() => {
    td.reset();
  });

  describe('static methods', () => {
    const fs = require('fs');
    const path = require('path');
    const glob = require('glob');

    let readFileCallback;
    let existsCallback;
    let globCallback;
    let loadCallback;
    let useCallback;

    beforeEach(() => {
      loadCallback = td.func('Resolver.loadFile');
      useCallback = td.func('Resolver.useFile');
      readFileCallback = td.func('fs.readFileSync');
      existsCallback = td.func('fs.existsSync');
      globCallback = td.func('glob.sync');

      td.replace(fs, 'readFileSync', readFileCallback);
      td.replace(fs, 'existsSync', existsCallback);
      td.replace(path, 'join', function join() {
        return Array.prototype.slice.call(arguments).join('/');
      });
      td.replace(glob, 'sync', globCallback);
    });

    describe('constructor', () => {
      function Foo() {}
      function Bar() {}
      const foo = () => 'FOO';
      const bar = () => 'BAR';
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

        td.when(Resolver.scanFiles('extra', decoratorInput))
          .thenReturn({
            registry: {
              bar,
            },
            values: {
              bar: Bar,
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

      it('should scan from multiple directories at once', () => {
        expect(new Resolver([cwd, 'extra'])._container.registry).to.be.deep.eql({ foo, bar });
        expect(new Resolver([cwd, 'extra'])._container.values).to.be.deep.eql({ foo: Foo, bar: Bar });
      });
    });

    describe('useFile', () => {
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
      beforeEach(() => {
        td.when(fs.existsSync('.')).thenReturn(true);
      });

      it('will fail on invalid directories', () => {
        expect(() => new Resolver('_')).to.throw("Invalid directory, given '_'");
      });

      it('will collect a registry of modules when constructed', () => {
        td.when(glob.sync('**/index.js', { cwd: '.', nosort: true }))
          .thenReturn([
            'Name/prop/injectableMethod/index.js',
            'Name/prop/method/index.js',
            'Example/index.js',
            'Test/index.js',
            'Test/sub/index.js',
            'Test/sub/nested/index.js',
            'other-test/with-dashes-and/such-things.js',
          ]);

        td.replace(Resolver, 'useFile', useCallback);
        td.replace(Resolver, 'loadFile', loadCallback);

        td.when(fs.existsSync('./Example/index.d.ts')).thenReturn(true);
        td.when(fs.existsSync('./Test/sub/index.d.ts')).thenReturn(true);
        td.when(fs.existsSync('./Test/sub/nested/index.d.ts')).thenReturn(true);

        td.when(fs.readFileSync('./Example/index.d.ts')).thenReturn(`
interface Example {
  y: number;
}
declare class Example {
  constructor(x: number);
}
export default Example;
`);
        td.when(fs.readFileSync('./Test/sub/index.d.ts')).thenReturn(`
import type { Stuff } from '../../types';
export default function callMe(x?: Stuff): number;
`);
        td.when(fs.readFileSync('./Test/sub/nested/index.d.ts')).thenReturn(`
declare const _default: ({ x }: {
    x: number;
}) => () => number;
/**
OSOM
*/
export default _default;
`);

        td.when(Resolver.loadFile('./Name/prop/injectableMethod/index.js')).thenReturn(ctx => () => ctx.undef);
        td.when(Resolver.loadFile('./Name/prop/method/index.js')).thenReturn(function method() {});
        td.when(Resolver.loadFile('./Example/index.js')).thenReturn(class Example {});
        td.when(Resolver.loadFile('./Test/index.js')).thenReturn({});
        td.when(Resolver.loadFile('./Test/sub/index.js')).thenReturn(function sub() {});
        td.when(Resolver.loadFile('./Test/sub/nested/index.js')).thenReturn(function nested() {});
        td.when(Resolver.loadFile('./other-test/with-dashes-and/such-things.js')).thenReturn(function suchThings() {});

        td.when(Resolver.useFile('./provider.js'))
          .thenReturn({
            getTest() {},
            getGlobal() {},
          });

        const container = new Resolver('.');
        expect(Resolver.typesOf(container).map(x => (x.type ? [`// ${x.type}`] : []).concat(x.chunk).join('\n')).join('\n')).to.eql(`
import type { TestSubNestedModule } from './Test/sub/nested/index.d';
import type TestSubModule from './Test/sub';
import type ExampleModule from './Example';
interface TestModule {}
interface OtherTestWithDashesAndModule {}
interface NamePropInjectableMethodModule {}
interface NamePropMethodModule {}
// Example
export interface ExampleInterface extends ExampleModule {}
// Test
export interface TestInterface extends TestModule {
  sub: typeof TestSubModule & {
    nested: typeof TestSubNestedModule;
  };
}
// OtherTest
export interface OtherTestInterface {
  withDashesAnd: typeof OtherTestWithDashesAndModule;
}
// Name
export interface NameInterface {
  prop: {
    injectableMethod: typeof NamePropInjectableMethodModule;
    method: typeof NamePropMethodModule;
  };
}
`.trim());

        expect(container._decorators.before).not.to.be.undefined;
        expect(container._decorators.after).not.to.be.undefined;
        expect(container._container.values.Example).not.to.be.undefined;
        expect(container._container.values.Name).not.to.be.undefined;
        expect(container._container.registry.Example).not.to.be.undefined;
        expect(container._container.registry.Name.prop.injectableMethod).not.to.be.undefined;
        expect(container._container.registry.Name.prop.method).not.to.be.undefined;
        expect(container._container.registry['other-test']).to.be.undefined;
        expect(container._container.registry.otherTest).to.be.undefined;
        expect(container._container.registry.OtherTest).not.to.be.undefined;
        expect(container._container.registry.OtherTest.withDashesAnd).not.to.be.undefined;
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

      it('should warn on unexpected providers', () => {
        td.when(glob.sync('**/index.js', { cwd: '.', nosort: true }))
          .thenReturn([
            'Test/provider.js',
          ]);

        td.replace(Resolver, 'loadFile', loadCallback);

        td.when(fs.existsSync('./Test/provider.js')).thenReturn(true);

        expect(() => new Resolver('.')).to.throw('Unexpected provider file, given ./Test/provider.js');
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
        keys: [1, 2],
        values: 'OK',
        registry: 'OK',
      };
    });

    describe('forEach', () => {
      it('can iterate registry members', () => {
        const each = td.func('forEach');

        expect(() => Resolver.prototype.forEach.call({
          _container,
        }, each)).not.to.throw();

        expect(td.explain(each).callCount).to.eql(2);
      });
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
