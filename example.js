const Container = require('./lib/container');

const $ = new Container(__dirname);

const User = $.getModel('User');

Promise.resolve()
  .then(() => User.sync({ force: true }))
  .then(() => User.add({ name: 'Example' }))
  .then(result => console.log(result.get()))
  .catch(console.log)
  .then(() => {
    const Token = $.getModel('Token');
    const token = new Token();

    console.log('>>>', token instanceof Token, Token.create());
  });
