const { spawn } = require('child_process');
const wargs = require('wargs');
const path = require('path');
const fs = require('fs-extra');
const ts = require('typescript');

function camelCase(value) {
  return value.replace(/-([a-z])/g, (_, $1) => $1.toUpperCase());
}

function info(message) {
  process.stdout.write(message.replace('\n', '\x1b[K\n'));
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

function check(host, argv, options) {
  host.writeFile = (fileName, contents) => {
    const baseDir = argv._.find(x => fileName.indexOf(x) === 0);

    if (baseDir && fileName.includes('.d.ts')) {
      const baseName = fileName.substr(baseDir.length + 1).replace('/index.d.ts', '');
      const name = camelCase(baseName.replace(/\//g, '-'));
      const tmp = contents.replace(/\/\*\*[^]*?\*\/\n/g, '');
      const matches = tmp.match(/export default (\w+)/);

      if (!matches) throw new TypeError(`Missing default export for '${name}Module'`);

      const declaration = tmp.match(new RegExp(`declare const ${matches[1]}[^]*?=>([^]*?);`));

      if (!declaration) {
        fs.outputFileSync(fileName, contents);
      } else {
        fs.outputFileSync(fileName, `${contents}export const ${name}Module:${declaration[1]};\n`);
      }
    } else {
      fs.outputFileSync(fileName, contents);
    }
  };
  return host;
}

function end(argv) {
  if (argv.flags.types) {
    const files = [];

    argv._.forEach(use => {
      const Container = require(path.resolve(use));
      const container = argv.flags.property ? Container[argv.flags.property] : Container;
      const directory = argv.flags.directory ? path.resolve(use, argv.flags.directory) : use;

      if (!('typedefs' in container)) {
        throw new TypeError(`Module '${use}' does not have typedefs`);
      }

      if (Array.isArray(container.typedefs)) {
        container.typedefs.forEach(chunk => {
          files.push([path.join(directory, chunk.name), chunk.contents]);
        });
      } else {
        files.push([path.join(directory, 'types.d.ts'), container.typedefs]);
      }
    });

    files.forEach(([file, contents]) => {
      fs.outputFileSync(file, `${contents}\n`);
      info(`\r\x1b[33mwrite\x1b[0m ${path.relative('.', file)}\n`);
    });
  }
}

async function watch(argv) {
  const configPath = ts.findConfigFile('./', ts.sys.fileExists, 'tsconfig.json');
  const defaults = { declaration: true };

  if (!configPath && argv.flags.types) {
    end(argv);
    return;
  }

  if (!configPath) throw new Error('Could not find a valid tsconfig.json file');
  if (!argv.flags.watch) {
    const options = require(path.resolve(configPath));

    options.compilerOptions = {
      ...defaults,
      ...options.compilerOptions,
    };

    const basePath = path.dirname(configPath);
    const parsedConfig = ts.parseJsonConfigFileContent(options, ts.sys, basePath);

    reportWatchStatusChanged({ messageText: 'Starting compilation...' });

    const host = ts.createCompilerHost(parsedConfig.options);
    const program = ts.createProgram(parsedConfig.fileNames, parsedConfig.options, check(host, argv, options));
    const emitResult = program.emit();
    const allDiagnostics = ts.getPreEmitDiagnostics(program).concat(emitResult.diagnostics);

    allDiagnostics.forEach(diagnostic => {
      reportWatchStatusChanged(diagnostic);
    });

    if (!allDiagnostics.length) {
      reportWatchStatusChanged({ messageText: 'Done without issues.\n' });
    }
    if (argv.raw.length) {
      await exec(argv.raw);
    }
    end(argv);
    process.exit(emitResult.emitSkipped ? 1 : 0);
  }

  const createProgram = ts.createEmitAndSemanticDiagnosticsBuilderProgram;
  const host = ts.createWatchCompilerHost(configPath, defaults, ts.sys, createProgram, reportDiagnostic, reportWatchStatusChanged);

  const origCreateProgram = host.createProgram;
  host.createProgram = (rootNames, options, host, oldProgram) => {
    return origCreateProgram(rootNames, options, host, oldProgram);
  };

  const origPostProgramCreate = host.afterProgramCreate;
  host.afterProgramCreate = async program => {
    origPostProgramCreate(program);

    if (argv.raw.length) {
      await exec(argv.raw);
    }
    end(argv);
  };

  ts.createWatchProgram(check(host, argv));
}

function reportDiagnostic(diagnostic) {
  if (!diagnostic.file) {
    info(`\r\x1b[33mTS${diagnostic.code}\x1b[0m ${ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')}\n`);
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

  info(`\r\x1b[2m${diagnostic.file.fileName}:${line + 1}:${character + 1}\x1b[0m\n\x1b[33mTS${diagnostic.code}\x1b[0m ${message}\n`);
}

const argv = wargs(process.argv.slice(2), {
  boolean: 'whVT',
  string: 'rpd',
  alias: {
    d: 'directory',
    p: 'property',
    r: 'require',
    V: 'verbose',
    T: 'types',
    w: 'watch',
    h: 'help',
  },
});

const USAGE_INFO = `
Compiles sources using existing tsconfig.json and any available typescript installation:

1. \`tsc\` options from the CLI are not supported, only those defined in the tsconfig.json file.

2. \`.d.ts\` files that matches any given PATH are augmented with an additional type extracted
   from the original declaration, this should be enough to describe all our injected functions.

3. invoke \`Resolver.typesOf()\` to get the top-level types from your containers,
   save them somewhere accessible to your scripts.

Usage:
  sastre [PATH...] [OPTIONS] -- [CMD...]

Options:
  -V, --verbose    # Print error.stack on failures
  -T, --types      # Export types from given paths
  -w, --watch      # Enable watch mode of sources
  -r, --require    # Preloads a NodeJS script
  -p, --property   # Use custom container
  -d, --directory  # Use given directory

Example:
  sastre path/to/container -p controllers -d ../api/controllers -- date
`;

if (!argv._.length || argv.flags.help) {
  console.log(USAGE_INFO);
  process.exit(1);
}

if (argv.flags.require) {
  const mod = argv.flags.require.charAt() === '.'
    ? path.resolve(argv.flags.require)
    : require.resolve(argv.flags.require);

  require(mod);
}

watch(argv).catch(e => {
  info(`\r\x1b[31m${e.message}\x1b[0m\n`);
  if (argv.flags.verbose) info(`${e.stack.replace(e.message, '').trim()}\n`);
  process.exit(1);
});
