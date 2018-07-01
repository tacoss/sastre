const RESOLVED_STATE = Symbol('@@Resolved');

class Injector {
  constructor(definition, injectables) {
    this.factory = definition;
    this.deps = injectables;
  }

  static hasLocked(target) {
    return !!target[RESOLVED_STATE];
  }

  static supports(target) {
    return target instanceof Injector;
  }

  static assign(target, extensions) {
    if (!['object', 'function'].includes(typeof target) || Array.isArray(target)) {
      throw new Error(`Target is not an object, given '${target}'`);
    }

    if (target[RESOLVED_STATE]) {
      throw new Error('Cannot assign to locked values');
    }

    Object.assign(target, extensions);
    Object.defineProperty(target, RESOLVED_STATE, {});

    return target;
  }
}

module.exports = Injector;
