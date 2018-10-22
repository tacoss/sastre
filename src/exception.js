export default class Exception extends Error {
  constructor(message, e) {
    super(message);
    this.stack = (e && e.stack) || this.stack;
  }
}
