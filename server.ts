import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json({ limit: '10mb' }));

// Persistent storage file path
const DATA_DIR = path.resolve(__dirname, 'data');
const STORE_FILE = path.resolve(DATA_DIR, 'tracker_store.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Initial default database structure
interface TrackerStore {
  auth: {
    username: string;
    passwordHash: string;
  };
  settings: {
    defaultMonthlyTarget: number;
    currency: string;
    rounding: string;
    formulaTotal: string;
    shifts: string[];
    columns: any[];
  };
  months: Record<string, any>;
  lastUpdated: string;
}

const DEFAULT_STORE: TrackerStore = {
  auth: {
    username: 'rider',
    passwordHash: 'zomato2026',
  },
  settings: {
    defaultMonthlyTarget: 50000,
    currency: '₹',
    rounding: 'round',
    formulaTotal: 'zomato_only',
    shifts: ['0000-0200', '0800-0200', '0800-0000'],
    columns: [
      { id: 'sr', label: 'SR', visible: true, numeric: true },
      { id: 'date', label: 'DATE', visible: true, numeric: false },
      { id: 'shift1', label: '0000-0200', visible: true, numeric: false, isShift: 1 },
      { id: 'shift2', label: '0800-0200', visible: true, numeric: false, isShift: 2 },
      { id: 'shift3', label: '0800-0000', visible: true, numeric: false, isShift: 3 },
      { id: 'zomato', label: 'ZOMATO', visible: true, numeric: true, editable: true },
      { id: 'total', label: 'TOTAL', visible: true, numeric: true },
      { id: 'daily_tgt', label: 'DAILY TGT', visible: true, numeric: true },
      { id: 'diff_daily', label: 'DIFF DAILY', visible: true, numeric: true },
      { id: 'sst_tgt', label: 'SST TGT', visible: true, numeric: true },
      { id: 'sst_day', label: 'SST -+ DAY', visible: true, numeric: true },
      { id: 'diff', label: 'DIFF', visible: true, numeric: true },
    ],
  },
  months: {
    '2026_2': {
      monthlyTarget: 50000,
      days: {
        1: { shift1: 'Zomato', shift2: 'Zomato', shift3: 'Zomato', zomato: 1725 },
        2: { shift1: 'Zomato', shift2: 'Zomato', shift3: 'Zomato', zomato: 1831 },
      },
    },
  },
  lastUpdated: new Date().toISOString(),
};

function readStore(): TrackerStore {
  try {
    if (fs.existsSync(STORE_FILE)) {
      const content = fs.readFileSync(STORE_FILE, 'utf-8');
      return { ...DEFAULT_STORE, ...JSON.parse(content) };
    }
  } catch (err) {
    console.error('Error reading store file:', err);
  }
  return { ...DEFAULT_STORE };
}

function writeStore(store: TrackerStore) {
  try {
    store.lastUpdated = new Date().toISOString();
    fs.writeFileSync(STORE_FILE, JSON.stringify(store, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error writing store file:', err);
  }
}

// Initialize file if not existing
if (!fs.existsSync(STORE_FILE)) {
  writeStore(DEFAULT_STORE);
}

// --- API ROUTES FOR SEAMLESS SYNC ACROSS MOBILE & LAPTOP ---

// 1. Get full sync data (called on app open or refresh)
app.get('/api/sync', (req, res) => {
  const store = readStore();
  res.json({
    success: true,
    data: store,
  });
});

// 2. Push full or partial sync data
app.post('/api/sync', (req, res) => {
  const { auth, settings, months } = req.body;
  const store = readStore();

  if (auth) {
    if (auth.username) store.auth.username = auth.username;
    if (auth.passwordHash) store.auth.passwordHash = auth.passwordHash;
  }
  if (settings) {
    store.settings = { ...store.settings, ...settings };
  }
  if (months) {
    store.months = { ...store.months, ...months };
  }

  writeStore(store);
  res.json({
    success: true,
    lastUpdated: store.lastUpdated,
    data: store,
  });
});

// 3. Save single month data instantly
app.post('/api/month/:year/:month', (req, res) => {
  const { year, month } = req.params;
  const monthData = req.body;
  const store = readStore();

  const key = `${year}_${month}`;
  store.months[key] = monthData;

  writeStore(store);
  res.json({
    success: true,
    key,
    lastUpdated: store.lastUpdated,
  });
});

// 4. Update credentials
app.post('/api/auth/update', (req, res) => {
  const { username, newPassword } = req.body;
  const store = readStore();

  if (username) store.auth.username = username;
  if (newPassword) store.auth.passwordHash = newPassword;

  writeStore(store);
  res.json({ success: true });
});

// 5. Reset data
app.post('/api/reset', (req, res) => {
  const { scope, year, month } = req.body;
  const store = readStore();

  if (scope === 'month' && year !== undefined && month !== undefined) {
    delete store.months[`${year}_${month}`];
  } else if (scope === 'all') {
    store.months = {};
  }

  writeStore(store);
  res.json({ success: true });
});

// Mount Vite or serve static assets
async function startServer() {
  const isProduction = process.env.NODE_ENV === 'production';

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
    app.use('*', async (req, res, next) => {
      const url = req.originalUrl;
      try {
        let template = fs.readFileSync(path.resolve(__dirname, 'index.html'), 'utf-8');
        template = await vite.transformIndexHtml(url, template);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
      } catch (e) {
        vite.ssrFixStacktrace(e as Error);
        next(e);
      }
    });
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Zomato Earning Tracker server running on port ${PORT}`);
  });
}

startServer();
