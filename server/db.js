const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

const DEFAULT_DATA = { videos: [] };

function ensureDb() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify(DEFAULT_DATA, null, 2));
  }
}

function readDb() {
  ensureDb();
  const raw = fs.readFileSync(DB_FILE, 'utf8');
  try {
    return JSON.parse(raw);
  } catch {
    return { ...DEFAULT_DATA };
  }
}

// Serialize writes so concurrent admin requests never clobber each other.
let writeChain = Promise.resolve();

function writeDb(data) {
  writeChain = writeChain.then(() => {
    const tmpFile = `${DB_FILE}.tmp`;
    fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2));
    fs.renameSync(tmpFile, DB_FILE);
  });
  return writeChain;
}

async function withDb(mutator) {
  ensureDb();
  const data = readDb();
  const result = await mutator(data);
  await writeDb(data);
  return result;
}

module.exports = { readDb, writeDb, withDb, DATA_DIR, DB_FILE };
