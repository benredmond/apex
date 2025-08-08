const { spawn } = require('child_process');

console.log('Testing Claude CLI with spawn...');

const claudePath = '/Users/ben/.claude/local/claude';
const prompt = 'Return exactly this JSON: {"patterns": [{"id": "TEST", "title": "Test Pattern"}]}';

console.log(`Calling: ${claudePath} -p`);
console.log(`Prompt length: ${prompt.length} chars`);

const child = spawn(claudePath, ['-p'], {
  stdio: ['pipe', 'pipe', 'pipe']
});

let stdout = '';
let stderr = '';

const timeout = setTimeout(() => {
  console.log('Timeout! Killing process...');
  child.kill();
}, 10000);

child.stdout.on('data', (data) => {
  stdout += data.toString();
  console.log('Got stdout data:', data.toString().substring(0, 100));
});

child.stderr.on('data', (data) => {
  stderr += data.toString();
  console.log('Got stderr:', data.toString());
});

child.on('error', (error) => {
  clearTimeout(timeout);
  console.error('Process error:', error);
});

child.on('close', (code) => {
  clearTimeout(timeout);
  console.log(`Process closed with code: ${code}`);
  if (stdout) {
    console.log('Response:', stdout.substring(0, 500));
  }
  if (stderr) {
    console.log('Stderr:', stderr);
  }
});

// Write prompt and close stdin
console.log('Writing prompt to stdin...');
child.stdin.write(prompt);
child.stdin.end();