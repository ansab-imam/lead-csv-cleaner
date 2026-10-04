#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cleanCsv, formatSummary, stringifyCsv } from '../src/index.js';

const HELP = `Usage: lead-csv-clean <input.csv> [options]

Clean, normalise and de-duplicate a lead/contact CSV export.

Options:
  -o, --output <file>       Where to write the cleaned CSV
                            (default: <input>-cleaned.csv next to the input)
  --country-code <digits>   Country code for numbers without one (default: 1)
  --drop-invalid            Move rows with invalid email/phone/website or no
                            contact details to rejected.csv beside the output
  --no-dedupe               Keep duplicate rows instead of merging them
  --dry-run                 Print the summary without writing any files
  -h, --help                Show this help
  -v, --version             Show the version number
`;

class UsageError extends Error {}

function parseArgs(argv) {
  const opts = { countryCode: '1', dedupe: true, dropInvalid: false, dryRun: false };
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const [flag, inline] = arg.startsWith('--') && arg.includes('=') ? arg.split(/=(.*)/s) : [arg, undefined];
    const takeValue = () => {
      const value = inline ?? argv[++i];
      if (value === undefined || value === '') throw new UsageError(`${flag} requires a value`);
      return value;
    };
    switch (flag) {
      case '-h':
      case '--help':
        opts.help = true;
        break;
      case '-v':
      case '--version':
        opts.version = true;
        break;
      case '-o':
      case '--output':
        opts.output = takeValue();
        break;
      case '--country-code':
        opts.countryCode = takeValue().replace(/^\+/, '');
        if (!/^\d{1,3}$/.test(opts.countryCode)) throw new UsageError('--country-code must be 1-3 digits, e.g. 1 or 44');
        break;
      case '--drop-invalid':
        opts.dropInvalid = true;
        break;
      case '--no-dedupe':
        opts.dedupe = false;
        break;
      case '--dry-run':
        opts.dryRun = true;
        break;
      default:
        if (arg.startsWith('-') && arg !== '-') throw new UsageError(`Unknown option: ${arg}`);
        positional.push(arg);
    }
  }
  if (positional.length > 1) throw new UsageError(`Expected one input file, got ${positional.length}`);
  opts.input = positional[0];
  return opts;
}

function main(argv) {
  const opts = parseArgs(argv);

  if (opts.help) {
    process.stdout.write(HELP);
    return 0;
  }
  if (opts.version) {
    const pkgPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'package.json');
    process.stdout.write(JSON.parse(readFileSync(pkgPath, 'utf8')).version + '\n');
    return 0;
  }
  if (!opts.input) throw new UsageError('Missing input file');
  if (!existsSync(opts.input)) throw new UsageError(`Input file not found: ${opts.input}`);

  const output =
    opts.output ?? path.join(path.dirname(opts.input), `${path.basename(opts.input, path.extname(opts.input))}-cleaned.csv`);
  const rejectedPath = opts.dropInvalid ? path.join(path.dirname(output), 'rejected.csv') : undefined;
  if (path.resolve(output) === path.resolve(opts.input)) throw new UsageError('Output file must differ from the input file');

  const { header, rows, rejected, stats } = cleanCsv(readFileSync(opts.input, 'utf8'), opts);

  if (!opts.dryRun) {
    writeFileSync(output, stringifyCsv([header, ...rows]));
    if (rejectedPath) writeFileSync(rejectedPath, stringifyCsv([header, ...rejected]));
  }
  process.stdout.write(formatSummary(stats, { output, rejectedPath, dryRun: opts.dryRun }) + '\n');
  return 0;
}

try {
  process.exitCode = main(process.argv.slice(2));
} catch (err) {
  process.stderr.write(`lead-csv-clean: ${err.message}\n`);
  if (err instanceof UsageError) process.stderr.write('Run "lead-csv-clean --help" for usage.\n');
  process.exitCode = 1;
}
