

// Login page tab functionality
const tabLinks = document.querySelectorAll('.nav-link');
const tabPanes = document.querySelectorAll('.tab-pane');
const socialAuthButtons = document.querySelectorAll('.social-auth-btn');
const switchTabLinks = document.querySelectorAll('.switch-tab-link');

function showTab(targetId) {
    tabLinks.forEach(link => {
        const isActive = link.getAttribute('href') === `#${targetId}`;
        link.classList.toggle('active', isActive);
        link.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });

    tabPanes.forEach(pane => {
        pane.classList.remove('show', 'active');
    });

    const targetPane = document.getElementById(targetId);
    if (targetPane) {
        targetPane.classList.add('show', 'active');
    }
}

tabLinks.forEach(link => {
    link.addEventListener('click', function(e) {
        e.preventDefault();
        const targetId = this.getAttribute('href').substring(1);
        showTab(targetId);
    });
});

switchTabLinks.forEach(link => {
    link.addEventListener('click', function(e) {
        e.preventDefault();
        showTab(this.dataset.target);
    });
});

socialAuthButtons.forEach(button => {
    button.addEventListener('click', () => {
        const provider = button.dataset.provider;
        const mode = button.dataset.mode;
        const actionText = mode === 'register' ? 'sign up' : 'sign in';

        alert(`${provider.charAt(0).toUpperCase() + provider.slice(1)} ${actionText} needs OAuth setup in your backend first.`);
    });
});


