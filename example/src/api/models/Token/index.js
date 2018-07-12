class Token {
  static create() {
    return Math.random().toString(36).substr(2, 7);
  }
}

module.exports = Token;
