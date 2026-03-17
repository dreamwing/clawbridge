const translations = {
    en: {
        // App Title
        app_name: "ClawBridge",
        app_tagline: "Mobile-first mission control for OpenClaw agents.",
        about_desc: "ClawBridge is the mobile-first dashboard for your AI Agent runtime.<br>Designed for monitoring, cost tracking, and task management.",
        
        // Navigation / Tabs
        tab_status: "Home",
        tab_logs: "Logs",
        tab_usage: "Cost",
        tab_jobs: "Missions",
        tab_scripts: "Scripts",
        tab_memory: "Memory",
        tab_settings: "Settings",

        // Legend
        legend_title: "Activity Legend",
        legend_tool: "Tool Call",
        legend_tool_desc: "External actions (search, exec, write)",
        legend_thinking: "Thinking",
        legend_thinking_desc: "AI reasoning & planning process",
        legend_script: "Script",
        legend_script_desc: "Background automation (Cron jobs)",
        legend_file: "File IO",
        legend_file_desc: "Workspace file creation or updates",
        legend_system: "System",
        legend_system_desc: "High CPU or resource alerts",
        legend_note: "Note: Monitoring polls every 3 seconds to minimize CPU usage. Extremely short-lived scripts (<3s) may not be captured in real-time logs.",

        // Global Actions
        refresh: "Refresh",
        loading: "Loading...",
        connecting: "Connecting...",
        connected: "Connected",
        disconnected: "Disconnected",
        retry: "Retry",

        // Status states
        status_live: "● Live",
        status_busy: "● Busy",
        status_idle: "● Idle",
        status_error: "● Error",

        // Settings
        lang_label: "Language",
        lang_en: "English",
        lang_zh: "Chinese",
        logout: "Logout",
        access_key: "Access Key",
        version: "ClawBridge Version",
        danger_zone: "Danger Zone",
        restart_gateway: "Restart Gateway Service",
        kill_all: "Emergency Stop All Scripts",
        about: "About",
        env: "Environment",
        server_tz: "Server Timezone",
        oc_core: "OpenClaw Core",
        cb_source: "ClawBridge Source",
        view_github: "View GitHub",
        gateway_stopped: "Stopped / Not Found",
        
        // Common Labels
        ram: "RAM",
        disk: "Disk",
        uptime: "Uptime",
        model: "Model",
        tokens: "Tokens",
        cost: "Cost",
        actions: "Actions",
        show_all: "Show all",
        show_less: "Show less",

        // New Status / Home Entries
        sys_status: "System Status",
        cpu_load: "CPU Load",
        live_activity: "LIVE ACTIVITY",
        memory_timeline: "Memory Timeline",
        today: "Today",
        btn_prev: "← Previous",
        btn_next: "Next →",

        // Token Economy
        token_economy: "Cost Analysis",
        total_label: "Total",
        today_cost: "Today's Cost",
        est_monthly: "Est. Monthly",
        cache_hit: "Cache Hit",
        last_updated: "LAST UPDATED",
        recalc_note: "System automatically recalculates every hour.",
        input_read: "INPUT (READ)",
        output_write: "OUTPUT (WRITE)",
        cost_trend: "COST TREND (7 DAYS)",
        top_models: "TOP MODELS",
        detail_in: "In",
        detail_out: "Out",
        detail_cache_r: "Cache R",
        detail_cache_w: "Cache W",

        // Memory
        memory_loading: "Accessing agent memories...",
        memory_empty: "No memory records found for this date.",
        memory_failed: "Failed to load memory.",

        // Missions & Control
        mission_control: "Mission Control",
        no_jobs: "No jobs found",
        confirm_run: "Execute task?",
        run_failed: "Failed to run job.",
        confirm_kill_all: "⚠️ STOP ALL SCRIPTS?",
        stop_failed: "Failed to stop scripts.",
        confirm_restart: "♻️ RESTART GATEWAY?",
        restart_failed: "Failed to restart gateway.",
        restart_sent: "Restart signal sent.",

        // Scripts/Status
        scripts_running: "Running",
        scripts_none: "No scripts running",
        docker_unavailable: "Unavailable in Docker Mode",

        // Optimizer
        opt_system_optimized: "System Optimized",
        opt_efficient_desc: "Token usage is highly efficient.",
        opt_btn_history: "History",
        opt_title: "Optimization Scanner",
        opt_desc: "Scanning for wasteful agent behaviors...",
        opt_btn_apply: "Apply",
        opt_btn_skip: "Skip",
        opt_btn_undo: "Undo",
        opt_impact: "Impact",
        opt_savings: "Monthly Savings",
        opt_no_data: "No usage data yet.",
        opt_preventative: "Preventative",
        opt_skipped_title: "Skipped Recommendations",
        opt_toggle_view: "Toggle View",
        opt_side_effect: "Side Effect",
        opt_tech_details: "Technical Details",
        opt_btn_restore: "Restore",
        opt_btn_confirm: "Confirm?",
        opt_btn_applying: "Applying...",
        opt_btn_applied: "Applied",
        opt_manual_action: "Manual Action Required",
        opt_history_title: "Recent Optimizations",
        opt_toast_applied: "Optimization Applied",
        opt_toast_failed: "Operation Failed",
        opt_analyzing: "Analyzing Usage Patterns",
        opt_current: "Current",
        opt_optimized: "Optimized",
        opt_actions_found: "Cost-Saving Actions Found",
        opt_implemented_title: "Implemented Optimizations",

        // Error Messages
        auth_failed: "Authentication Failed. Redirecting...",
        err_load_tokens: "Failed to load token stats",
        err_load_diagnostics: "Failed to load diagnostics",
        err_load_history: "Failed to load optimization history",
        err_generic: "An error occurred. Please try again."
    },
    zh: {
        // App Title
        app_name: "ClawBridge",
        app_tagline: "移动优先的 OpenClaw Agent 任务控制中心。",
        about_desc: "ClawBridge 是移动优先的 AI Agent 运行环境仪表盘。<br>专为监控、成本追踪和任务管理而设计。",
        
        // Navigation / Tabs
        tab_status: "主页",
        tab_logs: "日志",
        tab_usage: "成本",
        tab_jobs: "任务",
        tab_scripts: "脚本",
        tab_memory: "记忆",
        tab_settings: "设置",

        // Legend
        legend_title: "活动图例",
        legend_tool: "工具调用",
        legend_tool_desc: "外部操作 (搜索, 执行, 写入)",
        legend_thinking: "思考中",
        legend_thinking_desc: "AI 推理与规划过程",
        legend_script: "脚本",
        legend_script_desc: "后台自动化 (计划任务)",
        legend_file: "文件 IO",
        legend_file_desc: "工作区文件创建或更新",
        legend_system: "系统",
        legend_system_desc: "高 CPU 或资源警报",
        legend_note: "注：监测每 3 秒轮询一次以最小化 CPU 占用。运行时间极短的脚本（<3秒）可能无法在实时日志中被捕捉到。",

        // Global Actions
        refresh: "刷新",
        loading: "载入中...",
        connecting: "连接中...",
        connected: "已连接",
        disconnected: "已断开",
        retry: "重试",

        // Status states
        status_live: "● 在线",
        status_busy: "● 繁忙",
        status_idle: "● 空闲",
        status_error: "● 错误",

        // Settings
        lang_label: "语言",
        lang_en: "English",
        lang_zh: "中文",
        logout: "退出登录",
        access_key: "访问密钥",
        version: "ClawBridge 版本",
        danger_zone: "危险区域",
        restart_gateway: "重启网关服务",
        kill_all: "紧急停止所有脚本",
        about: "关于",
        env: "运行环境",
        server_tz: "服务器时区",
        oc_core: "OpenClaw 内核",
        cb_source: "ClawBridge 源码",
        view_github: "查看 GitHub",
        gateway_stopped: "已停止 / 未发现",
        
        // Common Labels
        ram: "内存",
        disk: "磁盘",
        uptime: "运行时间",
        model: "模型",
        tokens: "令牌",
        cost: "成本",
        actions: "操作",
        show_all: "显示全部",
        show_less: "收起",

        // New Status / Home Entries
        sys_status: "系统状态",
        cpu_load: "CPU 负载",
        live_activity: "实时活动",
        memory_timeline: "记忆时间轴",
        today: "今天",
        btn_prev: "← 上一页",
        btn_next: "下一页 →",

        // Token Economy
        token_economy: "成本分析",
        total_label: "总计",
        today_cost: "今日成本",
        est_monthly: "月度预估",
        cache_hit: "缓存命中",
        last_updated: "最后更新",
        recalc_note: "系统每小时自动重新计算。",
        input_read: "输入 (读)",
        output_write: "输出 (写)",
        cost_trend: "成本趋势 (7天)",
        top_models: "热门模型",
        detail_in: "输入",
        detail_out: "输出",
        detail_cache_r: "缓存读",
        detail_cache_w: "缓存写",

        // Memory
        memory_loading: "正在调取 Agent 记忆...",
        memory_empty: "未找到该日期的记忆记录。",
        memory_failed: "记忆加载失败。",

        // Missions & Control
        mission_control: "任务控制台",
        no_jobs: "未找到任务",
        confirm_run: "执行任务？",
        run_failed: "执行失败。",
        confirm_kill_all: "⚠️ 停止所有脚本？",
        stop_failed: "停止失败。",
        confirm_restart: "♻️ 重启网关？",
        restart_failed: "重启失败。",
        restart_sent: "重启信号已发送。",

        // Scripts/Status
        scripts_running: "运行中",
        scripts_none: "暂无运行中的脚本",
        docker_unavailable: "Docker 模式下不可用",

        // Optimizer
        opt_system_optimized: "系统已优化",
        opt_efficient_desc: "令牌使用效率极高。",
        opt_btn_history: "历史记录",
        opt_title: "优化扫描器",
        opt_desc: "正在扫描低效的代理行为...",
        opt_btn_apply: "应用",
        opt_btn_skip: "跳过",
        opt_btn_undo: "撤销",
        opt_impact: "影响",
        opt_savings: "月度节省",
        opt_no_data: "暂无使用数据。",
        opt_preventative: "预防性",
        opt_skipped_title: "已跳过的建议",
        opt_toggle_view: "切换视图",
        opt_side_effect: "副作用",
        opt_tech_details: "技术细节",
        opt_btn_restore: "恢复",
        opt_btn_confirm: "确定?",
        opt_btn_applying: "应用中...",
        opt_btn_applied: "已应用",
        opt_manual_action: "需要手动操作",
        opt_history_title: "最近的优化",
        opt_toast_applied: "优化已应用",
        opt_toast_failed: "操作失败",
        opt_analyzing: "分析使用模式中",
        opt_current: "当前",
        opt_optimized: "优化后",
        opt_actions_found: "发现可节省成本的操作",
        opt_implemented_title: "已实施的优化",

        // Error Messages
        auth_failed: "认证失败。正在跳转...",
        err_load_tokens: "成本数据加载失败",
        err_load_diagnostics: "诊断数据加载失败",
        err_load_history: "历史记录加载失败",
        err_generic: "发生错误，请稍后重试"
    }
};

let currentLang = localStorage.getItem('clawbridge_lang') || 
                  (navigator && navigator.language && navigator.language.startsWith('zh') ? 'zh' : 'en');

function t(key) {
    if (!translations[currentLang]) currentLang = 'en';
    return translations[currentLang][key] ?? key;
}

function setLanguage(lang) {
    if (translations[lang]) {
        currentLang = lang;
        localStorage.setItem('clawbridge_lang', lang);
        applyTranslations();
        
        // Custom events for dynamic components to re-render
        window.dispatchEvent(new CustomEvent('clawbridge-lang-change', { detail: { lang } }));
    }
}

function applyTranslations() {
    // Update document lang
    document.documentElement.lang = currentLang;

    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        
        // Dynamic content protection
        if (el.id === 'activity-feed' || el.id === 'memory-content') {
            const currentText = el.textContent.trim();
            // Expanded initial states to include memory_empty and memory_failed
            const initialStates = Object.keys(translations).flatMap(l => [
                translations[l].loading, 
                translations[l].memory_loading, 
                translations[l].connecting,
                translations[l].memory_empty, 
                translations[l].memory_failed,
                'Loading...', 
                'Accessing agent memories...', 
                'Connecting...',
                'No memory records found for this date.', 
                'Failed to load memory.'
            ]);
            
            const isInitial = initialStates.some(s => currentText === s);
            if (!isInitial) return;
        }

        if (el.classList.contains('job-list')) return;

        const translation = t(key);
        if (translation !== key) {
            if (key === 'about_desc' || key === 'legend_note') {
                el.innerHTML = translation;
            } else {
                el.textContent = translation;
            }
        }
    });
    
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        el.placeholder = t(key);
    });

    const selector = document.getElementById('lang-selector');
    if (selector) selector.value = currentLang;
}

// Initial application
applyTranslations();
document.addEventListener('DOMContentLoaded', applyTranslations);
