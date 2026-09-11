type CsvRow = string[];

function parseCsvLine(line: string): CsvRow {
  const cells: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    const next = line[index + 1];
    if (character === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === "," && !quoted) {
      cells.push(cell);
      cell = "";
    } else {
      cell += character;
    }
  }

  cells.push(cell);
  return cells;
}

const csvPath = process.argv[2];
if (!csvPath) throw new Error("CSV path is required");

const lines = (await Bun.file(csvPath).text())
  .split(/\r?\n/)
  .slice(2)
  .filter((line) => line.trim().length > 0);
const addresses = new Map<string, Set<string>>();

for (const line of lines) {
  const columns = parseCsvLine(line);
  const ward = columns[2]?.trim();
  const province = columns[5]?.trim();
  if (!ward || !province || province === "Tỉnh / Thành Phố") continue;
  const wards = addresses.get(province) ?? new Set<string>();
  wards.add(ward);
  addresses.set(province, wards);
}

const output = Object.fromEntries(
  [...addresses.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([province, wards]) => [
      province,
      [...wards].sort((left, right) => left.localeCompare(right)),
    ]),
);

await Bun.write(
  "src/constants/vietnam-addresses.ts",
  `export const vietnamAddresses = ${JSON.stringify(output, null, 2)} as const;\n`,
);
