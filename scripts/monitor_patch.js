// Monitor Core
function checkSystemStatus(callback) {
    checkFileChanges();

    exec("df -h / | awk 'NR==2 {print $5}'", (errDisk, stdoutDisk) => {
        const diskUsage = stdoutDisk ? stdoutDisk.trim() : '--%';

        // Get Gateway PID
        const gatewayPidCmd = "pgrep -f 'openclaw gateway' | head -n 1";
        
        exec(gatewayPidCmd, (errGw, stdoutGw) => {
            const gatewayPid = stdoutGw ? stdoutGw.trim() : null;

            const cmd = "ps -eo pid,pcpu,comm,args --sort=-pcpu | head -n 20";
            exec(cmd, (err, stdout) => {
                if (err) return callback({ status: 'error', task: 'Monitor Error' });

                const lines = stdout.trim().split('\n').slice(1);
                let activities = [];
                let runningScripts = []; // New: Track specific script processes
                let totalCpu = 0;
                let topProc = null;

                lines.forEach((line, index) => {
                    const parts = line.trim().split(/\s+/);
                    const pid = parts[0];
                    const cpu = parseFloat(parts[1]);
                    const comm = parts[2];
                    const args = parts.slice(3).join(' ');

                    if (!isNaN(cpu)) totalCpu += cpu;
                    
                    if (index === 0) topProc = `${comm} (${Math.round(cpu)}%)`;

                    if (comm === 'node' && args.includes('scripts/')) {
                        const script = args.match(/scripts\/([a-zA-Z0-9_.-]+)/)?.[1] || 'Script';
                        activities.push(`📜 ${script}`);
                        runningScripts.push({ pid, name: script });
                    }
                    
                    if (['grep', 'find', 'curl', 'wget', 'git', 'tar', 'python', 'python3'].includes(comm)) {
                        let detail = args.split(' ').pop();
                        if (comm === 'grep') detail = args.match(/"([^"]+)"/)?.[1] || detail;
                        if (detail && detail.length > 500) detail = detail.substring(0, 500) + '...';
                        activities.push(`🔧 ${comm} ${detail}`);
                    }
                });

                activities = [...new Set(activities)];
                const context = getActiveContext();
                
                let status = 'idle';
                let taskText = 'System Idle';
                
                if (context) {
                    status = 'busy';
                    taskText = context;
                } else if (activities.length > 0) {
                    status = 'busy';
                    taskText = activities.join(', ');
                } else if (totalCpu > 15.0) {
                    status = 'busy';
                    taskText = `⚡ High CPU: ${topProc || 'Unknown'}`;
                }

                if (taskText === 'System Idle') {
                    if (lastRecordedTask !== 'System Idle') {
                        lastRecordedTask = 'System Idle'; 
                    }
                } else {
                    logActivity(taskText);
                }

                const versions = getVersions();

                callback({
                    status: status,
                    task: taskText,
                    cpu: Math.round(totalCpu),
                    mem: Math.round((1 - os.freemem() / os.totalmem()) * 100),
                    disk: diskUsage,
                    timezone: process.env.TZ || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
                    lastHeartbeat: new Date().toISOString(),
                    versions: versions,
                    gatewayPid: gatewayPid,
                    scripts: runningScripts
                });
            });
        });
    });
}
