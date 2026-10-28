/**
 * 禪.瑜 Yoga Space - 互動腳本
 */

document.addEventListener('DOMContentLoaded', () => {
    initNavigation();
    initScrollAnimations();
    initCalendar();
    initBookingForm();
    initMobileMenu();
    initSmoothScroll();
});

// 全域滾動函式（供 HTML onclick 調用）
function scrollToSection(id) {
    const el = document.getElementById(id);
    if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        // 關閉手機選單
        const navLinks = document.querySelector('.nav-links');
        const toggle = document.querySelector('.nav-mobile-toggle');
        if (navLinks && navLinks.classList.contains('mobile-open')) {
            navLinks.classList.remove('mobile-open');
            if (toggle) toggle.classList.remove('active');
        }
    }
}

/**
 * 導航列
 */
function initNavigation() {
    const sections = document.querySelectorAll('section[id]');
    const navLinks = document.querySelectorAll('.nav-links a');
    
    window.addEventListener('scroll', () => {
        let current = '';
        
        sections.forEach(section => {
            const sectionTop = section.offsetTop;
            const sectionHeight = section.clientHeight;
            
            if (scrollY >= sectionTop - 200) {
                current = section.getAttribute('id');
            }
        });
        
        navLinks.forEach(link => {
            link.classList.remove('active');
            if (link.getAttribute('href') === '#' + current) {
                link.classList.add('active');
            }
        });
    });
}

/**
 * 滾動動畫 — Enhanced with stagger reveals（taste-skill MOTION=4: Standard layer）
 */
function initScrollAnimations() {
    const observerOptions = {
        threshold: 0.12,
        rootMargin: '0px 0px -60px 0px'
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                // Stagger siblings with reveal-delay classes
                const parent = entry.target.closest('[class*="grid"], [class*="scroll"]');
                if (parent) {
                    const siblings = parent.querySelectorAll('.reveal');
                    siblings.forEach((sib, i) => {
                        setTimeout(() => {
                            sib.classList.add('visible');
                        }, i * 100);
                    });
                }
                entry.target.classList.add('visible');
            }
        });
    }, observerOptions);

    // Observe cards — add .reveal class via JS if not in HTML
    document.querySelectorAll('.philosophy-card, .course-card, .gallery-item').forEach((el, i) => {
        el.classList.add('reveal');
        el.classList.add(`reveal-delay-${(i % 3) + 1}`);
        observer.observe(el);
    });

    // Teacher cards
    document.querySelectorAll('.teacher-card').forEach((el, i) => {
        el.classList.add('reveal');
        el.classList.add(`reveal-delay-${i + 1}`);
        observer.observe(el);
    });
}

/**
 * 小日曆互動
 */
function initCalendar() {
    const calendarDays = document.querySelectorAll('.calendar-days .day');
    const navBtns = document.querySelectorAll('.calendar-nav .nav-btn');
    
    calendarDays.forEach(day => {
        day.addEventListener('click', () => {
            if (day.classList.contains('available')) {
                calendarDays.forEach(d => d.classList.remove('selected'));
                day.classList.add('selected');
            }
        });
    });
    
    navBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            // 這裡可以實作月分切換
            console.log('Calendar navigation');
        });
    });
}

/**
 * 預約表單
 */
function initBookingForm() {
    const form = document.getElementById('bookingForm');
    const modal = document.getElementById('thanksModal');
    
    if (!form) return;
    
    // 設定日期為今天
    const dateInput = document.getElementById('date');
    if (dateInput) {
        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const dd = String(today.getDate()).padStart(2, '0');
        dateInput.value = `${yyyy}-${mm}-${dd}`;
        dateInput.min = `${yyyy}-${mm}-${dd}`;
    }
    
    form.addEventListener('submit', (e) => {
        e.preventDefault();
        
        // 簡單驗證
        const name = document.getElementById('name').value.trim();
        const phone = document.getElementById('phone').value.trim();
        const course = document.getElementById('course').value;
        const date = document.getElementById('date').value;
        const time = document.getElementById('time').value;
        
        if (!name || !phone || !course || !date || !time) {
            alert('請填寫完整資訊');
            return;
        }
        
        // 顯示感謝彈窗
        modal.classList.add('active');
        
        // 重置表單
        form.reset();
        
        // 如果有設定今天的日期，重新填入
        if (dateInput) {
            const today = new Date();
            const yyyy = today.getFullYear();
            const mm = String(today.getMonth() + 1).padStart(2, '0');
            const dd = String(today.getDate()).padStart(2, '0');
            dateInput.value = `${yyyy}-${mm}-${dd}`;
        }
    });
}

/**
 * 關閉彈窗
 */
function closeModal() {
    const modal = document.getElementById('thanksModal');
    if (modal) {
        modal.classList.remove('active');
    }
}

// 點擊彈窗背景也可關閉
document.getElementById('thanksModal')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) {
        closeModal();
    }
});

/**
 * 手機選單
 */
function initMobileMenu() {
    const toggle = document.querySelector('.nav-mobile-toggle');
    const navLinks = document.querySelector('.nav-links');
    
    if (!toggle || !navLinks) {
        console.log('Mobile menu elements not found');
        return;
    }
    
    toggle.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        navLinks.classList.toggle('mobile-open');
        toggle.classList.toggle('active');
        console.log('Menu toggled');
    }, { passive: false });
    
    // 點擊連結後關閉選單
    navLinks.querySelectorAll('a').forEach(link => {
        link.addEventListener('click', () => {
            navLinks.classList.remove('mobile-open');
            toggle.classList.remove('active');
        });
    });
}

/**
 * 平滑滾動到錨點
 */
function initSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            e.preventDefault();
            const href = this.getAttribute('href');
            const target = document.querySelector(href);
            if (target) {
                // 使用 scrollIntoView 或直接跳轉
                try {
                    target.scrollIntoView({
                        behavior: 'smooth',
                        block: 'start'
                    });
                } catch(err) {
                    // Fallback for older browsers
                    target.scrollIntoView(true);
                }
                
                // 延遲後跳轉（確保滑動有時間執行）
                setTimeout(() => {
                    window.location.hash = href;
                }, 300);
                
                // 關閉手機選單
                const navLinks = document.querySelector('.nav-links');
                const toggle = document.querySelector('.nav-mobile-toggle');
                if (navLinks && navLinks.classList.contains('mobile-open')) {
                    navLinks.classList.remove('mobile-open');
                    if (toggle) toggle.classList.remove('active');
                }
            }
        }, { passive: false });
    });
}
