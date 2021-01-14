const Sequelizer = require('json-schema-sequelizer');
const { Resolver } = require('@lib'); // eslint-disable-line

class ModelsResolver {
  constructor(container, modelsDir) {
    const DB = new Sequelizer('sqlite::memory:');
    const $ = new Resolver(container, modelsDir, {
      before(_name, definition) {
        DB.add({ $schema: { id: _name, ...definition } });
      },
      after(_name, definition) {
        if (DB.sequelize._resolved && DB.$refs[_name]) {
          if (!DB.models[_name]._resolved) {
            Object.assign(DB.models[_name], definition.classMethods);
            DB.models[_name]._resolved = true;
          }
          return DB.models[_name];
        }
        return definition;
      },
    });
    $.database = DB;
    $.connect = () => DB.connect();
    DB.ready(() => {
      Object.keys(DB.$refs).forEach(k => $.get(k, true));
    });
    return $;
  }
}

module.exports = ModelsResolver;
