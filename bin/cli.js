require('global-or-local').devDependencies(['typescript']);

const { spawn } = require('child_process');
const wargs = require('wargs');
const path = require('path');
const fs = require('fs-extra');

function toArray(value) {
  return (!Array.isArray(value) && value ? [value] : value) || [];
}

function info(message) {
  process.stdout.write(message.replace('\n', '\x1b[K\n'));
}

function pick(obj, key) {
  const keys = key.split('.');

  let temp = obj;
  try {
    while (keys.length > 0) {
      temp = temp[keys.shift()];
    }
  } catch (e) {
    throw new Error(`Failed to get '${key}' as container`);
  }
  return temp;
}

function exec(argv) {
  return new Promise(resolve => {
    if (argv.length) {
      process.stdout.write('\r\x1b[K');

      const child = spawn(argv[0], argv.slice(1), {
        stdio: 'inherit',
        env: process.env,
      });

      child.on('close', exitCode => {
        resolve(exitCode);
      });
    } else {
      resolve(0);
    }
  });
}

function check(host, argv) {
  host.changes = [];
  host.writeFile = (fileName, contents) => {
    const filePath = path.relative('.', fileName);

    if (!filePath.includes('tsconfig.tsbuildinfo')) {
      info(`\r\x1b[36mwrite\x1b[0m ${filePath}\x1b[K`);

      if (argv.flags.watch || argv.flags.verbose) info('\n');
    }

    fs.outputFileSync(fileName, contents);
    host.changes.push(filePath);
  };
  return host;
}

function load(mod) {
  return import(mod).then(result => {
    return result.default || result;
  });
}

async function build(argv) {
  if (argv.flags.watch) return;
  if (!argv.flags.types) return;

  const cwd = argv._[0];
  const entry = await load(path.resolve(cwd, argv.flags.import));
  const input = argv._.slice(1).concat(Object.keys(argv.params));
  const files = [];

  function push(container, directory) {
    if (!(container && 'typedefs' in container)) {
      throw new TypeError(`Module '${path.relative('.', directory)}' does not have typedefs`);
    }

    const { typedefs } = container;

    if (Array.isArray(typedefs)) {
      typedefs.forEach(chunk => {
        files.push([path.join(directory, chunk.name), chunk.contents]);
      });
    } else {
      files.push([path.join(directory, 'index.d.ts'), typedefs]);
    }
  }

  if (!input.length) {
    push(entry, path.resolve(cwd));
  }

  for (const param of input) {
    const isProp = param.charAt() !== ':';
    const key = !isProp ? param.substr(1): param;
    const val = argv.params[param] || key;

    const container = await pick(entry, key);
    const directory = path.resolve(cwd, isProp ? '' : val);

    if (!container) {
      throw new TypeError(`Container '${key}' is missing for '${path.relative('.', directory)}' in [${Object.keys(entry).join(', ')}]`);
    }

    push(container, param in argv.params ? path.join(directory, val) : directory);
  }

  files.forEach(([file, contents]) => {
    fs.outputFileSync(file, `${contents}\n`);
    info(`\r\x1b[36mwrite\x1b[0m ${path.relative('.', file)}\x1b[K\n`);
  });
  reportWatchStatusChanged({ messageText: 'Done without issues.\n' });
  return true;
}

let ts;
async function watch(argv) {
  ts = require('typescript');

  const isProd = process.env.NODE_ENV === 'production';
  const configPath = ts.findConfigFile('./', ts.sys.fileExists, 'tsconfig.json');
  const defaults = {
    noEmit: argv.flags.emit === false,
    incremental: !isProd,
    skipLibCheck: isProd,
    target: 'ES2021',
    module: 'commonjs',
    inlineSourceMap: true,
    esModuleInterop: true,
    isolatedModules: true,
    noUnusedLocals: true,
    strictNullChecks: true,
    noUnusedParameters: true,
    exactOptionalPropertyTypes: true,
    forceConsistentCasingInFileNames: true,
  };

  if (!configPath) throw new Error('Could not find a valid tsconfig.json file');
  if (!argv.flags.watch) {
    const options = require(path.resolve(configPath));

    options.compilerOptions = {
      ...defaults,
      ...options.compilerOptions,
    };

    delete options.compilerOptions.incremental;

    const basePath = path.resolve(path.dirname(configPath));
    const parsedConfig = ts.parseJsonConfigFileContent(options, ts.sys, basePath);

    reportWatchStatusChanged({ messageText: argv.flags.emit === false ? 'Type-checking sources, just wait...' : 'Starting typescript compilation...' });

    if (parsedConfig.errors.length > 0) {
      parsedConfig.errors.forEach(err => {
        reportDiagnostic(err);
      });
      process.exit(1);
    }

    const host = ts.createCompilerHost(parsedConfig.options);
    const program = ts.createProgram(parsedConfig.fileNames, parsedConfig.options, check(host, argv));
    const emitResult = program.emit();
    const allDiagnostics = ts.getPreEmitDiagnostics(program).concat(emitResult.diagnostics);

    allDiagnostics.forEach(diagnostic => {
      reportWatchStatusChanged(diagnostic);
    });

    if (!(argv.flags.watch || argv.flags.verbose) && argv.flags.emit !== false) {
      info(`\r${host.changes.length} file${host.changes.length === 1 ? '' : 's'} written\n`);
    }

    let exitCode;
    if (argv.raw.length) {
      exitCode = await exec(argv.raw);
    }
    if (!allDiagnostics.length && !exitCode) {
      reportWatchStatusChanged({ messageText: 'Done without issues.\n' });
    } else if (argv.flags.bail) {
      exitCode = 1;
    }
    process.exit(exitCode || (emitResult.emitSkipped ? 1 : 0));
  }

  const createProgram = ts.createEmitAndSemanticDiagnosticsBuilderProgram;
  const host = ts.createWatchCompilerHost(configPath, defaults, ts.sys, createProgram, reportDiagnostic, reportWatchStatusChanged);

  const origCreateProgram = host.createProgram;
  host.createProgram = (rootNames, options, host, oldProgram) => {
    if (argv.flags.clear) {
      process.stdout.write('\x1Bc');
    }

    return origCreateProgram(rootNames, options, host, oldProgram);
  };

  let _ready;
  const origPostProgramCreate = host.afterProgramCreate;
  host.afterProgramCreate = async program => {
    origPostProgramCreate(program);

    if (argv.raw.length) {
      if (!argv.flags.detach) {
        await exec(argv.raw);
      } else if (!_ready) {
        exec(argv.raw);
        _ready = true;
      }
    }
  };

  ts.createWatchProgram(check(host, argv));
}

function reportDiagnostic(diagnostic) {
  if (!diagnostic.file) {
    info(`\r\x1b[33m⚠ TS${diagnostic.code}\x1b[0m ${ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')}\n`);
    return;
  }

  diagnostic.file.fileName = diagnostic.file.fileName.replace(`${process.cwd()}/`, '');
  reportWatchStatusChanged(diagnostic);
}

function reportWatchStatusChanged(diagnostic) {
  if (!diagnostic.file) {
    info(`\r\x1b[2m${diagnostic.messageText}\x1b[0m\x1b[K\r`);
    return;
  }

  const { line, character } = ts.getLineAndCharacterOfPosition(diagnostic.file, diagnostic.start);
  const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');

  info(`\r\x1b[2m${diagnostic.file.fileName}:${line + 1}:${character + 1}\x1b[0m\n\x1b[33m⚠ TS${diagnostic.code}\x1b[0m ${message}\n`);
}

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
