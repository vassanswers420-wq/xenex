// ==========================================
// TIXWATCHER - LANDING PAGE INTERACTIONS
// ==========================================

// Initialize everything when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  initThemeToggle();
  initMobileNav();
  initScrollReveal();
  initFAQ();
  initCounters();
  initSmoothScroll();
});

// ==========================================
// THEME TOGGLE
// ==========================================

function initThemeToggle() {
  const themeToggle = document.getElementById('themeToggle');
  const themeIcon = themeToggle?.querySelector('.theme-icon');
  
  if (!themeToggle) return;
  
  // Check for saved theme preference or default to dark mode
  const savedTheme = localStorage.getItem('theme') || 'dark';
  
  if (savedTheme === 'dark') {
    document.body.classList.add('dark-mode');
    if (themeIcon) themeIcon.className = 'fa-solid fa-sun theme-icon';
  } else {
    document.body.classList.remove('dark-mode');
    if (themeIcon) themeIcon.className = 'fa-solid fa-moon theme-icon';
  }
  
  // Toggle theme on click
  themeToggle.addEventListener('click', () => {
    const isDark = document.body.classList.toggle('dark-mode');
    
    if (themeIcon) {
      themeIcon.className = isDark ? 'fa-solid fa-sun theme-icon' : 'fa-solid fa-moon theme-icon';
    }
    
    // Save preference
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    
    // Add smooth transition
    document.body.style.transition = 'background-color 0.3s ease, color 0.3s ease';
    setTimeout(() => {
      document.body.style.transition = '';
    }, 300);
  });
}

// ==========================================
// MOBILE NAVIGATION
// ==========================================

function initMobileNav() {
  const navToggle = document.getElementById('navToggle');
  const navLinks = document.querySelector('.nav-links');
  
  if (!navToggle || !navLinks) return;
  
  navToggle.addEventListener('click', () => {
    const isActive = navToggle.classList.toggle('active');
    
    // Animate hamburger icon
    const spans = navToggle.querySelectorAll('span');
    if (isActive) {
      spans[0].style.transform = 'rotate(45deg) translateY(7px)';
      spans[1].style.opacity = '0';
      spans[2].style.transform = 'rotate(-45deg) translateY(-7px)';
    } else {
      spans[0].style.transform = '';
      spans[1].style.opacity = '';
      spans[2].style.transform = '';
    }
    
    // Toggle mobile menu
    if (window.innerWidth <= 768) {
      if (isActive) {
        navLinks.style.display = 'flex';
        navLinks.style.flexDirection = 'column';
        navLinks.style.position = 'absolute';
        navLinks.style.top = '64px';
        navLinks.style.left = '0';
        navLinks.style.right = '0';
        navLinks.style.background = 'var(--bg-primary)';
        navLinks.style.borderTop = '1px solid var(--border-color)';
        navLinks.style.padding = 'var(--spacing-md)';
        navLinks.style.gap = 'var(--spacing-sm)';
        navLinks.style.animation = 'fadeInUp 0.3s ease';
      } else {
        navLinks.style.display = '';
        navLinks.style.flexDirection = '';
        navLinks.style.position = '';
        navLinks.style.top = '';
        navLinks.style.left = '';
        navLinks.style.right = '';
        navLinks.style.background = '';
        navLinks.style.borderTop = '';
        navLinks.style.padding = '';
        navLinks.style.gap = '';
      }
    }
  });
  
  // Close menu when link is clicked
  const links = navLinks.querySelectorAll('.nav-link');
  links.forEach(link => {
    link.addEventListener('click', () => {
      if (window.innerWidth <= 768 && navToggle.classList.contains('active')) {
        navToggle.click();
      }
    });
  });
}

// ==========================================
// SCROLL REVEAL ANIMATIONS
// ==========================================

function initScrollReveal() {
  const revealElements = document.querySelectorAll('[data-reveal]');
  
  if (!revealElements.length) return;
  
  const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
  };
  
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry, index) => {
      if (entry.isIntersecting) {
        // Add staggered delay
        setTimeout(() => {
          entry.target.classList.add('revealed');
        }, index * 100);
        
        observer.unobserve(entry.target);
      }
    });
  }, observerOptions);
  
  revealElements.forEach(element => {
    observer.observe(element);
  });
}

// ==========================================
// FAQ ACCORDION
// ==========================================

function initFAQ() {
  const faqItems = document.querySelectorAll('.faq-item');
  
  faqItems.forEach(item => {
    const question = item.querySelector('.faq-question');
    
    question.addEventListener('click', () => {
      // Close other items
      faqItems.forEach(otherItem => {
        if (otherItem !== item && otherItem.classList.contains('active')) {
          otherItem.classList.remove('active');
        }
      });
      
      // Toggle current item
      item.classList.toggle('active');
    });
  });
}

// ==========================================
// ANIMATED COUNTERS
// ==========================================

function initCounters() {
  const counters = document.querySelectorAll('.stat-number');
  
  if (!counters.length) return;
  
  const observerOptions = {
    threshold: 0.5
  };
  
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        animateCounter(entry.target);
        observer.unobserve(entry.target);
      }
    });
  }, observerOptions);
  
  counters.forEach(counter => {
    observer.observe(counter);
  });
}

function animateCounter(element) {
  const target = parseInt(element.getAttribute('data-target'));
  const duration = 2000; // 2 seconds
  const start = 0;
  const increment = target / (duration / 16); // 60fps
  let current = start;
  
  const timer = setInterval(() => {
    current += increment;
    
    if (current >= target) {
      element.textContent = formatNumber(target);
      clearInterval(timer);
    } else {
      element.textContent = formatNumber(Math.floor(current));
    }
  }, 16);
}

function formatNumber(num) {
  if (num >= 1000000000) {
    return '$' + (num / 1000000000).toFixed(0) + 'B+';
  } else if (num >= 1000000) {
    return (num / 1000000).toFixed(0) + 'M+';
  } else if (num >= 1000) {
    return (num / 1000).toFixed(0) + 'K+';
  }
  return num.toLocaleString();
}

// ==========================================
// SMOOTH SCROLL
// ==========================================

function initSmoothScroll() {
  const links = document.querySelectorAll('a[href^="#"]');
  
  links.forEach(link => {
    link.addEventListener('click', (e) => {
      const href = link.getAttribute('href');
      
      // Skip if href is just "#"
      if (href === '#') {
        e.preventDefault();
        return;
      }
      
      const target = document.querySelector(href);
      
      if (target) {
        e.preventDefault();
        
        const offsetTop = target.getBoundingClientRect().top + window.pageYOffset - 80;
        
        window.scrollTo({
          top: offsetTop,
          behavior: 'smooth'
        });
      }
    });
  });
}

// ==========================================
// NAVBAR SCROLL EFFECT
// ==========================================

let lastScroll = 0;
const nav = document.querySelector('.nav');

window.addEventListener('scroll', () => {
  const currentScroll = window.pageYOffset;
  
  if (currentScroll > 100) {
    nav?.classList.add('scrolled');
  } else {
    nav?.classList.remove('scrolled');
  }
  
  lastScroll = currentScroll;
});

// ==========================================
// PERFORMANCE OPTIMIZATIONS
// ==========================================

// Lazy load images
if ('loading' in HTMLImageElement.prototype) {
  const images = document.querySelectorAll('img[loading="lazy"]');
  images.forEach(img => {
    img.src = img.dataset.src || img.src;
  });
} else {
  // Fallback for browsers that don't support lazy loading
  const script = document.createElement('script');
  script.src = 'https://cdnjs.cloudflare.com/ajax/libs/lazysizes/5.3.2/lazysizes.min.js';
  document.body.appendChild(script);
}

// Preload critical assets
const preloadLinks = [
  { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
  { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: true }
];

preloadLinks.forEach(link => {
  const preload = document.createElement('link');
  preload.rel = link.rel;
  preload.href = link.href;
  if (link.crossorigin) preload.crossOrigin = '';
  document.head.appendChild(preload);
});

// ==========================================
// INTERSECTION OBSERVER POLYFILL CHECK
// ==========================================

if (!('IntersectionObserver' in window)) {
  console.warn('IntersectionObserver not supported. Loading polyfill...');
  
  const script = document.createElement('script');
  script.src = 'https://polyfill.io/v3/polyfill.min.js?features=IntersectionObserver';
  document.head.appendChild(script);
  
  script.onload = () => {
    initScrollReveal();
    initCounters();
  };
}

// ==========================================
// CONSOLE MESSAGE
// ==========================================

console.log(
  '%cTixWatcher%c\nProfessional Trading Platform\n',
  'font-size: 24px; font-weight: bold; color: #2962ff;',
  'font-size: 12px; color: #6a7187;'
);

console.log(
  '%cInterested in our platform? Visit: https://tixwatcher.com',
  'font-size: 12px; color: #26a69a;'
);