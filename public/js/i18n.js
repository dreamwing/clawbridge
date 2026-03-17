const translations = {
    en: {
        // App Title
        app_name: "ClawBridge",
        app_tagline: "Mobile-first mission control for OpenClaw agents.",
        about_desc: "ClawBridge is the mobile-first dashboard for your AI Agent runtime.<br>Designed for monitoring, cost tracking, and task management.",
        
        // Navigation / Tabs
        tab_status: "Home",
        tab_logs: "Logs",
        tab_usage: "Tokens",
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
        token_economy: "Token Economy",
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

        // Scripts/Status
        scripts_running: "Running",
        scripts_none: "No scripts running",
        docker_unavailable: "Unavailable in Docker Mode",
        gateway_stopped: "Stopped / Not Found",
        schedule_manual: "Manual",
        analyzing: "⏳ Analyzing...",
        in_progress: "⏳ In progress...",

        // Optimizer
        opt_no_data_title: "No usage data yet.",
        opt_no_data_desc: "Start chatting with your AI agent, then come back to see Token cost analysis and savings.",
        opt_system_optimized: "System Optimized.",
        opt_efficient_desc: "Token usage is highly efficient.",
        opt_actions_available: "available",
        opt_actions_found: "found",
        opt_tap_to_save: "Tap to save",
        opt_tap_to_review: "Tap to review & protect.",
        opt_btn_history: "History",
        opt_btn_optimize: "Optimize",
        opt_preventative: "🛡️ Preventative",
        opt_skipped_title: "Skipped Recommendations",
        opt_toggle_view: "Toggle View",
        opt_no_history: "No recent optimizations found.",
        opt_tech_details: "Technical Details",
        opt_side_effect: "Side Effect",
        opt_btn_skip: "Skip",
        opt_btn_apply: "Apply",
        opt_btn_restore: "Restore",
        opt_btn_confirm: "Confirm?",
        opt_btn_applying: "Applying...",
        opt_btn_applied: "✓ Applied",
        opt_manual_action: "ℹ️ Manual Action",
        opt_toast_skipped: "Recommendation skipped",
        opt_toast_restored: "Recommendation restored",
        opt_toast_applied: "Optimization applied",
        opt_toast_undoing: "Undo in progress...",
        opt_toast_undone: "✓ Restored {n} settings from {file}",
        opt_toast_failed: "Operation failed",
        opt_audit_summary: "Checked = remove. Unchecked = keep. {n} suggested for removal by default.",
        opt_audit_none_selected: "Nothing is pre-selected by default.",
        opt_audit_btn_keep_all: "Keep All",
        opt_audit_btn_remove_all: "Remove All",
        opt_audit_group_suggested: "Suggested Remove",
        opt_audit_group_manual: "Review Manually",
        opt_audit_choice_remove: "Remove",
        opt_audit_choice_keep: "Keep",

        // Time
        time_never: "Never",
        time_s_ago: "{n}s ago",
        time_m_ago: "{n}m ago",
        time_h_ago: "{n}h ago",
        time_in_m: "(in {n}m)",
        time_in_h: "(in {n}h)"
    },
    zh: {
        // App Title
        app_name: "ClawBridge",
        app_tagline: "移动优先的 OpenClaw Agent 任务控制中心。",
        about_desc: "ClawBridge 是移动优先的 AI Agent 运行环境仪表盘。<br>专为监控、成本追踪和任务管理而设计。",
        
        // Navigation / Tabs
        tab_status: "主页",
        tab_logs: "日志",
        tab_usage: "令牌",
        tab_jobs: "任务",
        tab_scripts: "脚本",
        tab_memory: "内存",
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
        memory_timeline: "内存时间轴",
        today: "今天",
        btn_prev: "← 上一页",
        btn_next: "下一页 →",

        // Token Economy
        token_economy: "令牌经济",
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

        // Scripts/Status
        scripts_running: "运行中",
        scripts_none: "暂无运行中的脚本",
        docker_unavailable: "Docker 模式下不可用",
        gateway_stopped: "已停止 / 未找到",
        schedule_manual: "手动",
        analyzing: "⏳ 分析中...",
        in_progress: "⏳ 进行中...",

        // Optimizer
        opt_no_data_title: "暂无使用数据。",
        opt_no_data_desc: "开始与 AI Agent 对话，稍后再来查看令牌成本分析和优化建议。",
        opt_system_optimized: "系统已优化。",
        opt_efficient_desc: "令牌使用效率极高。",
        opt_actions_available: "项建议可用",
        opt_actions_found: "项建议待处理",
        opt_tap_to_save: "点击可节省",
        opt_tap_to_review: "点击查看并保护系统。",
        opt_btn_history: "历史",
        opt_btn_optimize: "优化",
        opt_preventative: "🛡️ 预防性措施",
        opt_skipped_title: "已跳过的建议",
        opt_toggle_view: "切换视图",
        opt_no_history: "未找到最近的优化记录。",
        opt_tech_details: "技术细节",
        opt_side_effect: "副作用",
        opt_btn_skip: "跳过",
        opt_btn_apply: "应用",
        opt_btn_restore: "还原",
        opt_btn_confirm: "确认？",
        opt_btn_applying: "应用中...",
        opt_btn_applied: "✓ 已应用",
        opt_manual_action: "ℹ️ 手动操作",
        opt_toast_skipped: "建议已跳过",
        opt_toast_restored: "建议已还原",
        opt_toast_applied: "优化已应用",
        opt_toast_undoing: "撤销中...",
        opt_toast_undone: "✓ 已从 {file} 还原 {n} 项设置",
        opt_toast_failed: "操作失败",
        opt_audit_summary: "勾选 = 移除。未勾选 = 保留。默认建议移除 {n} 项。",
        opt_audit_none_selected: "默认不预选任何项。",
        opt_audit_btn_keep_all: "全部保留",
        opt_audit_btn_remove_all: "移除全部",
        opt_audit_group_suggested: "建议移除",
        opt_audit_group_manual: "手动核对",
        opt_audit_choice_remove: "移除",
        opt_audit_choice_keep: "保留",

        // Time
        time_never: "从未运行",
        time_s_ago: "{n}秒前",
        time_m_ago: "{n}分前",
        time_h_ago: "{n}小时前",
        time_in_m: "({n}分后)",
        time_in_h: "({n}小时后)"
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
        document.documentElement.lang = lang;
        applyTranslations();
        
        // Custom events for dynamic components to re-render
        window.dispatchEvent(new CustomEvent('clawbridge-lang-change', { detail: { lang } }));
    }
}

function applyTranslations() {
    document.documentElement.lang = currentLang;
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        const translation = t(key);
        
        // Dynamic content protection
        if (el.id === 'memory-content') {
            const currentText = el.textContent.trim();
            // Expanded initial states to include memory_empty and memory_failed
            const initialStates = [
                translations.en.loading, translations.zh.loading,
                translations.en.memory_loading, translations.zh.memory_loading,
                translations.en.connecting, translations.zh.connecting,
                translations.en.memory_empty, translations.zh.memory_empty,
                translations.en.memory_failed, translations.zh.memory_failed,
                'Loading...', 'Accessing agent memories...', 'Connecting...',
                'No memory records found for this date.', 'Failed to load memory.'
            ];
            
            const isInitial = initialStates.some(s => currentText === s);
            if (!isInitial) return;
        }

        if (el.classList.contains('job-list')) return;

        if (translation !== key) {
            if (key === 'about_desc') {
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

document.addEventListener('DOMContentLoaded', applyTranslations);
