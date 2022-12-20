const td = require('testdouble');
const { expect } = require('chai');

/* global it, describe, beforeEach, afterEach */

describe('User', () => {
  let container;
  let User;
  beforeEach(async () => {
    if (!container) {
      container = await require('@src/container');
    }
    User = container.getModel('User');
  });

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

    it('can mock User.create as expected', () => {
      const input = {
        some: 'INFO',
      };

      td.replace(User, 'create', createCallback);
      td.when(User.create(input)).thenResolve({ save: saveCallback });

      return User.add(input).then(result => {
        expect(result).to.be.eql(IF_OK);
      });
    });

    it('can mock through DI as expected', () => {
      const addFactory = require('.');

      // here we can use td.imitate(User) but it'll do a deep-mock, and we don't want that...
      // we could be using a Repository-pattern here, just to mock that instead, e.g. td.imitate(UserRepo)

      const UserMock = { create: td.func() };
      const TokenMock = { makeId: td.func() };

      const input = {
        foo: 'BAR',
      };

      td.when(UserMock.create(input)).thenResolve({ save: saveCallback });

      const add = addFactory({ User: UserMock, Token: TokenMock });

      return add(input).then(result => {
        expect(result).to.be.eql(IF_OK);
      });
    });
  });
});
