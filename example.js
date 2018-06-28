const Container = require('./lib/container');

const $ = new Container(__dirname);

const User = $.getModel('User');

console.log($.models.registry.User);
console.log(User);

console.log('>>>', User.create({ a: 'Dummy' }));

Promise.resolve()
  .then(() => User.classMethods.add({ foo: 'bar' }))
  .then(console.log)
  .catch(console.log)
  .then(() => {
    const Token = $.getModel('Token');
    const token = new Token();

    console.log('>>>', token instanceof Token, Token.create());
  });
