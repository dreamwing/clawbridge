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
        schedule_manual: "Manual",

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
        opt_actions_available: "action(s) available",
        opt_tap_to_save: "Tap to save",
        opt_tap_to_review: "Tap to review & protect.",
        opt_no_data_title: "No usage data yet.",
        opt_no_data_desc: "Start chatting with your AI agent, then come back to see Token cost analysis and savings.",
        opt_btn_optimize: "Optimize",
        opt_no_history: "No optimization history yet.",
        
        // Optimizer History
        hist_saved: "saved",
        hist_undo: "Undo",
        hist_restore_skills: "Restore Skills",
        hist_undo_unavailable: "Undo unavailable after newer changes.",
        hist_undoing: "Undoing...",

        // Skill Audit
        opt_audit_summary: "{n} skill(s) selected for removal.",
        opt_audit_none_selected: "No skills selected for removal.",
        opt_audit_btn_keep_all: "Keep All",
        opt_audit_btn_remove_all: "Remove Flagged",
        opt_audit_group_suggested: "Suggested for Removal",
        opt_audit_group_manual: "Manual Review Required",
        opt_audit_choice_remove: "Remove",
        opt_audit_choice_keep: "Keep",

        // Optimizer Action Mappings
        'A01_title': "Switch to a cheaper AI model",
        'A01_desc': "Primary usage is on premium model. Switching to smaller models saves cost.",
        'A01_side_effect': "Mild decrease in performance on highly complex reasoning tasks.",
        'A02_title': "Reduce Heartbeat frequency",
        'A02_desc': "Lowering the background check frequency reduces token consumption.",
        'A02_side_effect': "Longer intervals delay cross-agent message delivery.",
        'A03_title': "Continue existing conversations",
        'A03_desc': "Reusing context instead of starting new sessions saves input tokens.",
        'A03_side_effect': "Longer conversations may eventually need compaction.",
        'A04_title': "Audit possibly inactive skills",
        'A04_desc': "Removing unused skills reduces the system prompt size.",
        'A04_side_effect': "Removed Skills will no longer be available until re-installed.",
        'A05_title': "Make the AI think less",
        'A05_desc': "Minimal thinking mode reduces internal reasoning tokens.",
        'A05_side_effect': "May reduce mathematical or logical accuracy on hard prompts.",
        'A06_title': "Turn on Prompt Caching",
        'A06_desc': "Caching repeated prompts can save up to 90% on input costs.",
        'A06_side_effect': "First message per session remains full price.",
        'A07_title': "Enable Compaction Safeguard",
        'A07_desc': "Auto-trim long conversations to prevent runaway billing.",
        'A07_side_effect': "May truncate history during massive code translation sessions.",
        'A09_title': "Ask the AI to be concise",
        'A09_desc': "Shortening responses reduces output token costs.",
        'A09_side_effect': "Responses become visibly shorter.",

        // Time
        time_s_ago: "{n}s ago",
        time_m_ago: "{n}m ago",
        time_h_ago: "{n}h ago",
        time_d_ago: "{n}d ago",
        time_just_now: "just now",
        time_never: "Never",
        time_in_m: "(in {n}m)",
        time_in_h: "(in {n}h)",

        // Login
        login_title: "Secure Dashboard Login",
        login_key_placeholder: "Access Key",
        login_btn: "Sign In",
        login_verifying: "Verifying Identity...",
        login_error_invalid: "Invalid Access Key",
        login_error_network: "Connection lost. Check your network.",
        login_magic_notice: "⚠️ For security reasons, this version of ClawBridge no longer supports direct Magic Link access. Please enter your Access Key manually.",

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
        schedule_manual: "手动",

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
        opt_actions_available: "项可执行操作",
        opt_tap_to_save: "点击以每月节省",
        opt_tap_to_review: "点击以查看并保护系统。",
        opt_no_data_title: "无使用数据",
        opt_no_data_desc: "开始与 AI 代理对话，稍后再回来查看成本分析和节省建议。",
        opt_btn_optimize: "立即优化",
        opt_no_history: "暂无优化历史。",

        // Optimizer History
        hist_saved: "已节省",
        hist_undo: "撤销",
        hist_restore_skills: "还原技能",
        hist_undo_unavailable: "由于存在更新的配置变更，无法撤销。",
        hist_undoing: "正在撤销...",

        // Skill Audit
        opt_audit_summary: "已选择 {n} 个待移除技能。",
        opt_audit_none_selected: "未选择待移除技能。",
        opt_audit_btn_keep_all: "全部保留",
        opt_audit_btn_remove_all: "移除已选",
        opt_audit_group_suggested: "建议移除",
        opt_audit_group_manual: "需手动核对",
        opt_audit_choice_remove: "移除",
        opt_audit_choice_keep: "保留",

        // Optimizer Action Mappings
        'A01_title': "切换到更便宜的 AI 模型",
        'A01_desc': "主要使用量集中在旗舰模型。切换为小型模型可显著降低成本。",
        'A01_side_effect': "在高度复杂的推理任务中性能可能略有下降。",
        'A02_title': "降低心跳检测频率",
        'A02_desc': "降低后台检测频率可减少令牌消耗。",
        'A02_side_effect': "较长的间隔会延迟跨代理的消息投递。",
        'A03_title': "继续现有对话",
        'A03_desc': "重用上下文而非启动新会话可节省输入令牌。",
        'A03_side_effect': "较长的对话最终可能需要进行压缩处理。",
        'A04_title': "审计可能闲置的技能",
        'A04_desc': "移除未使用的技能可减小系统提示词体积。",
        'A04_side_effect': "移除的技能在重新安装前将无法使用。",
        'A05_title': "减少 AI 思考开销",
        'A05_desc': "启用最小思考模式可减少内部推理令牌。",
        'A05_side_effect': "可能会降低处理难题时的数学或逻辑准确性。",
        'A06_title': "开启提示词缓存",
        'A06_desc': "缓存重复提示词可节省高达 90% 的输入成本。",
        'A06_side_effect': "每个会话的第一条消息仍按原价计算。",
        'A07_title': "启用自动压缩保护",
        'A07_desc': "自动裁剪长对话以防止账单失控。",
        'A07_side_effect': "在大规模代码翻译过程中可能会截断历史记录。",
        'A09_title': "要求 AI 言简意赅",
        'A09_desc': "缩短回复内容可节省输出令牌成本。",
        'A09_side_effect': "回复内容会明显变短。",

        // Time
        time_s_ago: "{n}秒前",
        time_m_ago: "{n}分钟前",
        time_h_ago: "{n}小时前",
        time_d_ago: "{n}天前",
        time_just_now: "刚刚",
        time_never: "从未",
        time_in_m: "({n}分钟后)",
        time_in_h: "({n}小时后)",

        // Login
        login_title: "仪表盘安全登录",
        login_key_placeholder: "访问密钥",
        login_btn: "登录",
        login_verifying: "身份验证中...",
        login_error_invalid: "无效的访问密钥",
        login_error_network: "连接已断开，请检查网络。",
        login_magic_notice: "⚠️ 出于安全考虑，此版本的 ClawBridge 不再支持魔法链接（Magic Link）直接访问。请手动输入访问密钥。",

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
