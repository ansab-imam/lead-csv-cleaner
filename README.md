# lead-csv-cleaner

A small command-line tool that cleans messy lead and contact CSV exports (Apollo, LinkedIn, Google Maps scrapers, hand-kept spreadsheets) before you import them into a CRM.

Lead lists rarely arrive clean. Names are in capitals, emails say "n/a", phone numbers come in five formats, websites carry tracking parameters, and the same person appears three times. Importing that as-is creates duplicate contacts and broken records that are tedious to fix later. `lead-csv-clean` fixes the routine problems, merges duplicates, and flags anything it cannot fix so you can review it.

- Node.js 18 or newer
- Zero runtime dependencies
- Includes its own RFC 4180 CSV parser and writer (quoted fields, escaped quotes, embedded commas and newlines, CRLF/LF, UTF-8 BOM)

## Install

The package is not published to npm. Run it straight from GitHub:

```sh
npx github:ansab-imam/lead-csv-cleaner input.csv -o cleaned.csv
```

Or clone it and link the command:

```sh
git clone https://github.com/ansab-imam/lead-csv-cleaner.git
cd lead-csv-cleaner
npm link            # makes `lead-csv-clean` available on your PATH
lead-csv-clean input.csv -o cleaned.csv
```

Or run it without linking:

```sh
node bin/lead-csv-clean.js input.csv -o cleaned.csv
```

## Usage

```
lead-csv-clean <input.csv> [options]
```

| Option | Description |
| --- | --- |
| `-o, --output <file>` | Where to write the cleaned CSV. Default: `<input>-cleaned.csv` next to the input. |
| `--country-code <digits>` | Country code added to phone numbers that have none. Default: `1`. |
| `--drop-invalid` | Move rows with problems (see below) to `rejected.csv` in the same folder as the output, instead of keeping them in the output. |
| `--no-dedupe` | Keep duplicate rows instead of merging them. |
| `--dry-run` | Print the summary only; write no files. |
| `-h, --help` | Show help. |
| `-v, --version` | Show the version number. |

Exit codes: `0` on success, `1` on bad usage, a missing input file or an unreadable CSV. Errors are printed to stderr.

## What it does

**Header detection.** Column names are matched case-insensitively, ignoring spaces and punctuation:

| Field | Recognised headers (examples) |
| --- | --- |
| `email` | Email, E-mail, Email Address, Work Email |
| `phone` | Phone, Phone Number, Mobile, Cell, Tel, Telephone |
| `company` | Company, Company Name, Business, Organization |
| `first_name` / `last_name` | First Name, Given Name / Last Name, Surname |
| `full_name` | Full Name, Name, Contact Name |
| `website` | Website, URL, Domain, Homepage |

Unrecognised columns (for example "Job Title") are kept, cleaned of extra whitespace, and written after the standard columns.

**Output columns.** Every output file has these columns, in this order, followed by any unrecognised columns and finally `flags`:

`first_name, last_name, full_name, email, phone, company, website, domain`

**Cleaning rules.**

- **Whitespace:** every value is trimmed and runs of spaces, tabs and newlines become one space.
- **Names:** title-cased per word, hyphen and apostrophe (`JOHN o'NEIL` becomes `John O'Neil`, `mary-jane` becomes `Mary-Jane`). Names starting with `Mc` get a capital after it (`McDonald`). `Mac` is left alone because it is too often wrong (Mack, Macy).
- **Name splitting:** if there are no first/last name columns, the full name is split on the first space (`Anna de la Cruz` becomes `Anna` / `de la Cruz`). `Last, First` is recognised and reordered. If there is no full name column, it is built from first + last.
- **Emails:** lowercased, `mailto:` removed. Placeholders such as `n/a`, `none`, `null`, `-` are removed. Anything that still does not look like an email is kept but flagged `invalid_email`.
- **Phones:** reduced to digits and written in E.164 form, e.g. `+12125550101`. Extensions (`ext. 12`, `x12`) are dropped. Numbers that already start with `+` or `00` keep their own country code. With the default country code `1`, a national number must have exactly 10 digits (11 if it starts with `1`). Numbers that cannot be fixed keep their bare digits and are flagged `short_phone`, `long_phone` or `invalid_phone`.
- **Websites:** reduced to `https://<domain>`, with `www.`, paths, query strings and tracking parameters (`utm_*`, `fbclid`, ...) removed. The bare domain is also written to the `domain` column, which is what most CRMs use to match companies. Values that are not a usable domain are kept as-is and flagged `invalid_website`.

**Flags.** The `flags` column lists issues separated by `; `:

| Flag | Meaning | Rejected by `--drop-invalid` |
| --- | --- | --- |
| `invalid_email` | Email is not a valid address | yes |
| `short_phone` / `long_phone` / `invalid_phone` | Phone could not be normalised | yes |
| `invalid_website` | Website is not a usable domain | yes |
| `no_contact` | Neither email nor phone | yes |
| `missing_name` | No name at all | no |
| `missing_company` | No company | no |

## Before and after

Rows from [`examples/messy-leads.csv`](examples/messy-leads.csv) (all data is fictional):

| Before | After |
| --- | --- |
| `  JOHN o'NEIL ` · `John.ONeil@Example.com` · `(212) 555-0101` · `https://www.brightwater.example/contact?utm_source=apollo&utm_medium=export` | `John` · `O'Neil` · `john.oneil@example.com` · `+12125550101` · `https://brightwater.example` · `brightwater.example` |
| `sarah   mcdonald` · `SARAH@greenleaf.example` · `212.555.0102` · `www.greenleaf.example` | `Sarah` · `McDonald` · `sarah@greenleaf.example` · `+12125550102` · `https://greenleaf.example` |
| `"Hartley, Emma"` · `+1 212 555 0103`, and a duplicate `emma hartley` · `n/a` · `2125550103` | One row: `Emma` · `Hartley` · `emma.hartley@example.com` · `+12125550103` |
| `Priya Shah` · `priya.shah@example` · `1-212-555-0105`, and a duplicate with `priya@northgate.example` · `212-555-0105 ext. 12` | One row with the valid email `priya@northgate.example` and phone `+12125550105`, no flags |
| `Grace Turner` · `grace.turner@@example.com` · `turner studio` | Kept, flagged `invalid_email; invalid_website` |

## Example run

```sh
node bin/lead-csv-clean.js examples/messy-leads.csv -o cleaned.csv
```

```
lead-csv-cleaner summary
------------------------
Rows read:            25
Duplicates merged:    6
Rows written:         19
Names split:          24
Junk emails removed:  3

Columns detected:
  full_name   <- "Full Name"
  email       <- "E-mail"
  phone       <- "Phone Number"
  company     <- "Company Name"
  website     <- "Website"
  (kept as-is: "Job Title")

Flags:
  short_phone      2
  long_phone       2
  no_contact       1
  missing_name     1
  invalid_email    1
  invalid_website  1

Output:   cleaned.csv
```

With `--drop-invalid`, the same file gives 13 clean rows in `cleaned.csv` and 6 rows in `rejected.csv`.

## How deduplication and merging work

Rows are compared using up to three keys, in this order:

1. **Email**, case-insensitive (only valid emails count).
2. **Phone**, by its normalised digits (only phones that normalised cleanly count).
3. **Company + full name**, case-insensitive (only when both are present).

A row joins the first existing group that shares any of its keys, and the group then learns that row's keys too. So if row A matches row B by email and row B matches row C by phone, all three end up as one contact.

Each group is then merged into a single row:

- The **most complete** row (the one with the most non-empty fields) is the base. Ties go to the earliest row.
- Its **empty fields** are filled from the other rows, in file order. Website and domain are always taken together.
- An **invalid email or phone** in the base is replaced by a valid one from a duplicate, because the duplicate usually holds the corrected value.

Flags are worked out after merging, so they describe the row that is actually written. Merged rows appear where the first row of their group appeared. Use `--no-dedupe` to turn all of this off.

## Use as a library

```js
import { readFileSync } from 'node:fs';
import { cleanCsv, stringifyCsv } from 'lead-csv-cleaner';

const { header, rows, rejected, stats } = cleanCsv(readFileSync('leads.csv', 'utf8'), {
  countryCode: '44',
  dedupe: true,
  dropInvalid: false,
});
```

## Running the tests

```sh
npm test
```

The tests use the built-in `node:test` runner and cover the CSV parser edge cases, name casing, email, phone and website normalisation, header detection, deduplication and merging, the CLI, and an end-to-end run on the example file.

## License

MIT © 2026 Socialist Fox. See [LICENSE](LICENSE).
