// pull-to-refresh.js
document.addEventListener('DOMContentLoaded', () => {
    // Only apply on mobile devices
    if (window.innerWidth > 768) return;

    const ptrIcon = `
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
        <path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>`;
    
    const ptrElement = document.createElement('div');
    ptrElement.className = 'ptr-element';
    ptrElement.innerHTML = ptrIcon;
    document.body.appendChild(ptrElement);

    let startY = 0;
    let isPulling = false;
    let isRefreshing = false;

    document.addEventListener('touchstart', (e) => {
        if (window.scrollY === 0 && !isRefreshing) {
            startY = e.touches[0].pageY;
            isPulling = true;
            ptrElement.style.transition = 'none';
        }
    }, { passive: true });

    document.addEventListener('touchmove', (e) => {
        if (!isPulling) return;
        
        const y = e.touches[0].pageY;
        const delta = y - startY;

        // Only act if pulling down
        if (delta > 0 && window.scrollY <= 5) {
            // Add some resistance
            const pullDistance = Math.min(delta * 0.4, 80);
            ptrElement.style.transform = `translateX(-50%) translateY(${pullDistance}px) rotate(${pullDistance * 2}deg)`;
            
            // If pulled enough, show it's ready
            if (pullDistance > 55) {
                ptrElement.style.color = 'var(--brand-600, #1D4ED8)';
            } else {
                ptrElement.style.color = '#94A3B8';
            }
        }
    }, { passive: true });

    document.addEventListener('touchend', (e) => {
        if (!isPulling) return;
        isPulling = false;
        
        // Use regex or parsing to get translateY value from transform string
        const transformStr = ptrElement.style.transform;
        let y = 0;
        const match = transformStr.match(/translateY\(([^p]+)px\)/);
        if (match && match[1]) {
            y = parseFloat(match[1]);
        }

        ptrElement.style.transition = 'transform 0.3s ease, top 0.3s ease';

        if (y > 55) {
            // Trigger refresh
            isRefreshing = true;
            document.body.classList.add('ptr-refreshing');
            ptrElement.style.transform = 'translateX(-50%) translateY(55px)';
            
            // Reload page
            setTimeout(() => {
                window.location.reload(true);
            }, 600);
        } else {
            // Cancel refresh
            ptrElement.style.transform = 'translateX(-50%) translateY(0)';
        }
    });
});
