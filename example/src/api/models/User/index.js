const Sequelize = require('sequelize');

const User = {
  attributes: {
    name: {
      type: Sequelize.STRING,
    },
  },
};

module.exports = User;
