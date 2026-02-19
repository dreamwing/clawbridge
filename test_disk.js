
const { exec } = require('child_process');

exec("df -h / | awk 'NR==2 {print $5}'", (err, stdout, stderr) => {
    console.log('Error:', err);
    console.log('Stdout:', JSON.stringify(stdout));
    console.log('Stderr:', stderr);
    console.log('Parsed:', stdout ? stdout.trim() : 'FAIL');
});
