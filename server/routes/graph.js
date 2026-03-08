import { Router } from 'express';
import path from 'path';
import fs from 'fs/promises';
import { exec } from 'child_process';
import { buildGraph } from '../graph/builder.js';

export const graphRouter = Router();

graphRouter.post('/analyze', async (req, res) => {
  const { path: targetPath, includeExternal } = req.body;
  if (!targetPath) {
    return res.status(400).json({ error: 'path is required' });
  }

  const resolved = path.resolve(targetPath);
  try {
    const stat = await fs.stat(resolved);
    if (!stat.isDirectory()) {
      return res.status(400).json({ error: 'path must be a directory' });
    }
  } catch {
    return res.status(404).json({ error: `Directory not found: ${resolved}` });
  }

  const graph = await buildGraph(resolved, { includeExternal: !!includeExternal });
  res.json(graph);
});

// Opens a native OS folder picker and returns the selected path.
// macOS: uses osascript. Linux: uses zenity if available, else kdialog.
graphRouter.get('/pick-folder', (req, res) => {
  const platform = process.platform;
  let cmd;
  if (platform === 'darwin') {
    cmd = `osascript -e 'POSIX path of (choose folder with prompt "Select a project folder")'`;
  } else if (platform === 'linux') {
    cmd = `zenity --file-selection --directory --title="Select a project folder" 2>/dev/null || kdialog --getexistingdirectory 2>/dev/null`;
  } else {
    return res.status(501).json({ error: 'Folder picker not supported on this platform' });
  }

  exec(cmd, (err, stdout) => {
    if (err || !stdout.trim()) {
      // User cancelled — not an error, just no path
      return res.json({ path: null, cancelled: true });
    }
    res.json({ path: stdout.trim() });
  });
});

graphRouter.get('/file', async (req, res) => {
  const { path: filePath } = req.query;
  if (!filePath) return res.status(400).json({ error: 'path required' });

  const resolved = path.resolve(filePath);
  try {
    const content = await fs.readFile(resolved, 'utf-8');
    const ext = path.extname(resolved).slice(1);
    res.json({ content, ext, path: resolved });
  } catch (e) {
    res.status(404).json({ error: `File not found: ${resolved}` });
  }
});
