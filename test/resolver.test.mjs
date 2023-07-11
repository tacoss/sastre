import * as td from 'testdouble';
import { expect } from 'chai';
import { createRequire } from 'module';

/* eslint-disable no-unused-expressions */

import Resolver from '../src/resolver.mjs';

const require = createRequire(import.meta.url);

/* global it, describe, beforeEach, afterEach */

describe('Resolver', () => {
  afterEach(() => {
    td.reset();
  });

  describe('static methods', () => {
    const fs = require('fs');
    const path = require('path');

    let existsCallback;
    let globCallback;
    let loadCallback;
    let useCallback;

    beforeEach(() => {
      loadCallback = td.func('Resolver.loadFile');
      useCallback = td.func('Resolver.useFile');
      existsCallback = td.func('fs.existsSync');
      globCallback = td.func('globSync');

      td.replace(fs, 'existsSync', existsCallback);
      td.replace(path, 'join', function join() {
        return Array.prototype.slice.call(arguments).join('/');
      });
      td.replace(Resolver, 'searchFiles', globCallback);
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
          .thenResolve({
            registry: {
              foo,
            },
            values: {
              foo: Foo,
            },
          });
      });

      it('should have no _container', () => {
        expect(new Resolver(cwd)._container).to.be.undefined;
      });

      it('can receive context as first arg', () => {
        expect(() => new Resolver(null, cwd)).not.to.throw();
      });

      it('can use any given callback as after-decorator', () => {
        expect(new Resolver(cwd, () => -1)._decorators.after()).to.eql(-1);
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
      it('is just a wrapper for import() calls', async () => {
        expect(await Resolver.loadFile('util')).to.be.eql(require('util'));
      });
    });

    describe('scanFiles', () => {
      beforeEach(() => {
        td.when(fs.existsSync('.')).thenReturn(true);
      });

      it('will fail on invalid directories', async () => {
        let error;
        try {
          await new Resolver('_').resolve();
        } catch (e) {
          error = e;
        }
        expect(error.message).to.eql("Invalid directory, given '_'");
      });

      it('will collect a registry of modules when constructed', async () => {
        td.when(Resolver.searchFiles(td.matchers.isA(String), true))
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

        td.when(Resolver.loadFile('./Name/prop/injectableMethod/index.js')).thenResolve(ctx => () => ctx.undef);
        td.when(Resolver.loadFile('./Name/prop/method/index.js')).thenResolve(function method() {});
        td.when(Resolver.loadFile('./Example/index.js')).thenResolve(class Example {});
        td.when(Resolver.loadFile('./Test/index.js')).thenResolve({});
        td.when(Resolver.loadFile('./Test/sub/index.js')).thenResolve(function sub() {});
        td.when(Resolver.loadFile('./Test/sub/nested/index.js')).thenResolve(function nested() {});
        td.when(Resolver.loadFile('./other-test/with-dashes-and/such-things.js')).thenResolve(function suchThings() {});

        td.when(Resolver.useFile('./provider.js'))
          .thenResolve({
            getTest() {},
            getGlobal() {},
          });

        const container = await new Resolver('.').resolve();

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

        expect(Resolver.typesOf(container, { references: true }).map(x => (x.type ? [`// ${x.type}`] : []).concat(x.chunk).join('\n')).join('\n')).to.eql(`
import type { nested as TestSubNestedModule } from './Test/sub/nested';
import type { method as NamePropMethodModule } from './Name/prop/method';
import type { injectableMethod as NamePropInjectableMethodModule } from './Name/prop/injectableMethod';
import type { withDashesAnd as OtherTestWithDashesAndModule } from './OtherTest/with-dashes-and';
import type { sub as TestSubModule } from './Test/sub';
import type TestModule from './Test';
import type ExampleModule from './Example';
// Example
export interface ExampleInterface extends ExampleModule {}
export namespace ExampleInterfaceModule {}
// Test
export interface TestInterface extends TestModule {
  sub: TestInterfaceModule.Sub;
}
export namespace TestInterfaceModule {
  export interface Sub extends TestSubModule {
    nested: typeof TestSubNestedModule;
  }
}
// OtherTest
export interface OtherTestInterface {
  withDashesAnd: OtherTestInterfaceModule.WithDashesAnd;
}
export namespace OtherTestInterfaceModule {
  export type WithDashesAnd = typeof OtherTestWithDashesAndModule;
}
// Name
export interface NameInterface {
  prop: NameInterfaceModule.Prop;
}
export namespace NameInterfaceModule {
  export interface Prop {
    injectableMethod: typeof NamePropInjectableMethodModule;
    method: typeof NamePropMethodModule;
  }
}
`.trim());
      });

      it('can skip the after-callback', async () => {
        td.when(Resolver.searchFiles(td.matchers.isA(String), true))
          .thenReturn([
            'Test/index.js',
          ]);

        td.replace(Resolver, 'loadFile', loadCallback);

        td.when(Resolver.loadFile('./Test/index.js')).thenResolve(class Test {});

        const result = await Resolver.scanFiles('.');

        expect(result.values.Test).not.to.be.undefined;
      });

      it('should warn on unexpected providers', async () => {
        td.when(Resolver.searchFiles(td.matchers.isA(String), true))
          .thenReturn([
            'Test/provider.js',
          ]);

        td.replace(Resolver, 'loadFile', loadCallback);

        td.when(fs.existsSync('./Test/provider.js')).thenReturn(true);

        let error;
        try {
          await new Resolver('.').resolve();
        } catch (e) {
          error = e;
        }
        expect(error.message).to.eql('Unexpected provider file, given ./Test/provider.js');
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
          types: -1,
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

    describe('resolve', () => {
      it('should locate modules', async () => {
        expect(new Resolver('.').resolve).not.to.throw();
      });
    })

    describe('get types', () => {
      it('should access container', async () => {
        expect((await new Resolver('.').resolve()).types).to.eql(-1);
      });
    });

    describe('get values', () => {
      it('should access container', async () => {
        expect((await new Resolver('.').resolve()).values).to.eql(-1);
      });
    });

    describe('get registry', () => {
      it('should access container', async () => {
        expect((await new Resolver('.').resolve()).registry).to.eql(-1);
      });
    });
  });
});
