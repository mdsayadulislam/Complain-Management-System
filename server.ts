import express, { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

function getPublicRuntimeEnvScript(): string {
  const url = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').trim();
  const anonKey = (
    process.env.VITE_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    ''
  ).trim();

  if (!url && !anonKey) return '';

  const payload = JSON.stringify({
    VITE_SUPABASE_URL: url,
    VITE_SUPABASE_ANON_KEY: anonKey,
  }).replace(/</g, '\\u003c');

  return `<script>window.__BAUST_ENV__ = ${payload};</script>`;
}

function injectRuntimeEnv(html: string): string {
  const scriptTag = getPublicRuntimeEnvScript();
  if (!scriptTag) return html;
  return html.replace('</head>', `  ${scriptTag}\n  </head>`);
}

app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    university: 'Bangladesh Army University of Science and Technology (BAUST)',
    auth_mode: 'supabase',
  });
});

async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'custom',
    });
    app.use(vite.middlewares);

    app.use('*', async (req: Request, res: Response, next) => {
      try {
        const url = req.originalUrl;
        const templatePath = path.resolve(__dirname, 'index.html');
        let template = fs.readFileSync(templatePath, 'utf-8');
        template = await vite.transformIndexHtml(url, template);
        template = injectRuntimeEnv(template);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
      } catch (e) {
        next(e);
      }
    });
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir, { index: false }));
    app.get('*', (_req, res) => {
      const htmlPath = path.join(distDir, 'index.html');
      const html = injectRuntimeEnv(fs.readFileSync(htmlPath, 'utf-8'));
      res.status(200).set({ 'Content-Type': 'text/html' }).send(html);
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`BAUST Student Grievance System running on http://0.0.0.0:${PORT}`);
  });
}

void startServer();
