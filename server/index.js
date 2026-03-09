import express from 'express';
import cors from 'cors';
import path from 'path';
import { graphRouter } from './routes/graph.js';

const app = express();
const PORT = process.env.PORT || 3001;

// In production (compiled sidecar inside .app), serve the bundled frontend.
// process.execPath = .../linc.app/Contents/MacOS/server
// Resources live at  .../linc.app/Contents/Resources/frontend/
if (typeof process.pkg !== 'undefined') {
  const frontendPath = path.join(path.dirname(process.execPath), '..', 'Resources', 'frontend');
  app.use(express.static(frontendPath));
}

app.use(cors({ origin: ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:3001'] }));
app.use(express.json());
app.use('/api', graphRouter);

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: err.message });
});

app.listen(PORT, () => {
  console.log(`linc server running on http://localhost:${PORT}`);
});
