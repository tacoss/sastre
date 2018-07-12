const container = require('@src/container');
const td = require('testdouble');

require('chai').should();

const User = container.getModel('User');

/* global it, describe, beforeEach, afterEach */

describe('User', () => {
  describe('#add', () => {
    let createCallback;
    let saveCallback;

    let IF_OK;

    beforeEach(() => {
      createCallback = td.func('User.create');
      saveCallback = td.func('user.save');

      IF_OK = Symbol('IT_SHALL_NOT_PASS');

      td.when(saveCallback()).thenReturn(IF_OK);
    });

    afterEach(() => {
      td.reset();
    });

    it('can mock User.create as expected', async () => {
      const input = {
        some: 'INFO',
      };

      td.replace(User, 'create', createCallback);
      td.when(User.create(input)).thenResolve({ save: saveCallback });

      const result = await User.add(input);

      result.should.be.eql(IF_OK);
    });

    it('can mock through DI as expected', async () => {
      const addFactory = require('.');

      // here we can use td.imitate(User) but it'll do a deep-mock, and we don't want that...
      // we could be using a Repository-pattern here, just to mock that instead, e.g. td.imitate(UserRepo)

      const UserMock = td.imitate({ create() {} });
      const TokenMock = td.imitate({ create() {} });

      const input = {
        foo: 'BAR',
      };

      td.when(UserMock.create(input)).thenResolve({ save: saveCallback });

      const add = addFactory({ User: UserMock, Token: TokenMock });

      const result = await add(input);

      result.should.be.eql(IF_OK);
    });
  });
});
