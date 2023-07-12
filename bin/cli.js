require('global-or-local').devDependencies(['typescript']);

const wargs = require('wargs');
const path = require('path');

const { build, watch, load, info, toArray } = require('./main');

const argv = wargs(process.argv.slice(2), {
  boolean: 'cdbtwhVE',
  string: 'ri',
  alias: {
    E: 'no-emit',
    V: 'verbose',
    r: 'require',
    i: 'import',
    d: 'detach',
    t: 'types',
    w: 'watch',
    c: 'clear',
    b: 'bail',
    h: 'help',
  },
});

const USAGE_INFO = `
Compiles sources using existing tsconfig.json and any available typescript installation.

When --types are enabled, instead, generates type declarations from given containers.

Usage:
  sastre [PATH] [OPTIONS] [TYPEDEFS...] -- [CMD...]

Options:
  -V, --verbose   Enable more detailed logs
  -r, --require   Preloads a NodeJS script
  -i, --import    Module from relative path
  -d, --detach    Run CMD after watch once
  -t, --types     Enable typedefs generation
  -w, --watch     Enable watch mode of sources
  -c, --clear     Clear screen between changes
  -b, --bail      Exits from build on any failure
  -E, --no-emit   Do not write files, just check types

TypeDefs:
  prop        Set prop as container, use PATH as directory
  prop:path   Set prop as container, use relative PATH as directory
  :prop       Shortcut for prop:prop, use its named PATH as directory

Examples:
  sastre example/src/api -ti ../container :controllers :models -r module-alias/register
  sastre tests/fixtures/models -ti ../main nested.models -- date
  sastre src/containers -t api:models
`;

if (argv.flags.help) {
  console.log(USAGE_INFO);
  process.exit(1);
}

async function preload() {
  if (argv.flags.require) {
    for (const mod of toArray(argv.flags.require)) {
      await load(mod.charAt() === '.' ? path.resolve(mod) : require.resolve(mod));
    }
  }
}

Promise.resolve()
  .then(() => preload())
  .then(() => build(argv))
  .then(skip => !skip && watch(argv))
  .catch(e => {
    info(`\r\x1b[31m${e.message}\x1b[0m\n`);
    if (argv.flags.verbose) info(`${e.stack.replace(e.message, '').trim()}\n`);
    process.exit(1);
  });
