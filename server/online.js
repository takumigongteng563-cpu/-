// インターネットで遊ぶ：Cloudflare の「トンネル」で、このPCのゲームに外からつながるURLを作る。
// アカウント登録はいらない。URLは起動するたびに変わる。
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const ASSETS = {
  'win32-x64': 'cloudflared-windows-amd64.exe',
  'win32-arm64': 'cloudflared-windows-amd64.exe',
  'linux-x64': 'cloudflared-linux-amd64',
  'linux-arm64': 'cloudflared-linux-arm64',
  'darwin-x64': 'cloudflared-darwin-amd64.tgz',
  'darwin-arm64': 'cloudflared-darwin-arm64.tgz',
};

export const status = { state: 'off', url: null, message: '' };

async function ensureBinary(dir) {
  const asset = ASSETS[`${process.platform}-${process.arch}`];
  if (!asset) throw new Error('このパソコンでは、インターネットで遊ぶ機能が使えません');
  if (asset.endsWith('.tgz')) throw new Error('Macでは、ターミナルで「brew install cloudflared」をしてから使ってください');
  const file = path.join(dir, process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared');
  if (fs.existsSync(file)) return file;
  fs.mkdirSync(dir, { recursive: true });
  status.state = 'downloading';
  status.message = 'インターネットにつなぐ道具をダウンロードしています（はじめの1回だけ）…';
  console.log(status.message);
  const res = await fetch(`https://github.com/cloudflare/cloudflared/releases/latest/download/${asset}`);
  if (!res.ok) throw new Error(`ダウンロードに失敗しました（${res.status}）`);
  fs.writeFileSync(file + '.part', Buffer.from(await res.arrayBuffer()));
  fs.renameSync(file + '.part', file);
  if (process.platform !== 'win32') fs.chmodSync(file, 0o755);
  return file;
}

export async function startTunnel(rootDir, port) {
  try {
    let bin = 'cloudflared';
    try { bin = await ensureBinary(path.join(rootDir, 'tools')); } catch (e) {
      if (process.platform !== 'darwin') throw e;
    }
    status.state = 'starting';
    status.message = 'インターネットにつないでいます…';
    const child = spawn(bin, ['tunnel', '--no-autoupdate', '--url', `http://localhost:${port}`], { stdio: ['ignore', 'pipe', 'pipe'] });
    const onData = (buf) => {
      const m = String(buf).match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
      if (m && !status.url) {
        status.url = m[0];
        status.state = 'on';
        status.message = '';
        console.log('\n=============================================');
        console.log(' 友だちに送るURL： ' + status.url);
        console.log('=============================================\n');
      }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('exit', (code) => {
      status.state = 'error';
      status.url = null;
      status.message = `インターネットとの接続が切れました（${code}）。黒い画面を閉じて、もう一度起動してください`;
      console.log(status.message);
    });
    process.on('exit', () => child.kill());
  } catch (e) {
    status.state = 'error';
    status.message = e.message;
    console.log('インターネットで遊ぶ準備に失敗：' + e.message);
  }
}
