'use strict';

class ScopeError extends Error {
  constructor(message, e) {
    super(message);
    this.stack = (e && e.stack) || this.stack;
  }
}

module.exports = ScopeError;
