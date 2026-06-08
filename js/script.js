/* ============================================
   QUIET SPOT FINDER — SHARED APP LOGIC
   ============================================ */

const App = {
    currentUser: null,

    init() {
        this.loadUser();
        this.setupNav();
        this.setupMobileMenu();
    },

    loadUser() {
        const stored = localStorage.getItem('quietSpotUser');
        if (stored) {
            try {
                this.currentUser = JSON.parse(stored);
                this.updateNavUser();
            } catch (e) {
                localStorage.removeItem('quietSpotUser');
            }
        }
    },

    saveUser(user) {
        this.currentUser = user;
        localStorage.setItem('quietSpotUser', JSON.stringify(user));
        this.updateNavUser();
    },

    logout() {
        this.currentUser = null;
        localStorage.removeItem('quietSpotUser');
        this.updateNavUser();
        this.showToast('Logged out successfully', 'info');
        setTimeout(() => {
            if (window.location.pathname.includes('login')) {
                window.location.reload();
            }
        }, 800);
    },

    updateNavUser() {
        const loginLink = document.getElementById('loginNavLink');
        const userChip = document.getElementById('userChip');
        const userName = document.getElementById('userName');
        const logoutBtn = document.getElementById('logoutBtn');

        if (!loginLink || !userChip) return;

        if (this.currentUser) {
            loginLink.classList.add('hidden');
            userChip.classList.remove('hidden');
            userName.textContent = this.currentUser.username;
            if (logoutBtn) {
                logoutBtn.onclick = () => this.logout();
            }
        } else {
            loginLink.classList.remove('hidden');
            userChip.classList.add('hidden');
        }
    },

    setupNav() {
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => this.logout());
        }
    },

    setupMobileMenu() {
        const toggle = document.getElementById('mobileToggle');
        const links = document.getElementById('menuLinks');
        if (toggle && links) {
            toggle.addEventListener('click', () => {
                links.classList.toggle('open');
                toggle.textContent = links.classList.contains('open') ? '✕' : '☰';
            });
        }
    },

    initLoginPage() {
        const loginForm = document.getElementById('loginForm');
        const registerForm = document.getElementById('registerForm');
        const showRegister = document.getElementById('showRegister');
        const showLogin = document.getElementById('showLogin');
        const loginToggle = document.getElementById('loginToggle');
        const registerToggle = document.getElementById('registerToggle');

        if (showRegister) {
            showRegister.addEventListener('click', () => {
                loginForm.classList.add('hidden');
                loginToggle.classList.add('hidden');
                registerForm.classList.remove('hidden');
                registerToggle.classList.remove('hidden');
            });
        }

        if (showLogin) {
            showLogin.addEventListener('click', () => {
                registerForm.classList.add('hidden');
                registerToggle.classList.add('hidden');
                loginForm.classList.remove('hidden');
                loginToggle.classList.remove('hidden');
            });
        }

        if (loginForm) {
            loginForm.addEventListener('submit', (e) => {
                e.preventDefault();
                const username = document.getElementById('loginUsername').value.trim();
                const password = document.getElementById('loginPassword').value;

                const users = JSON.parse(localStorage.getItem('quietSpotUsers') || '{}');
                if (users[username] && users[username].password === password) {
                    this.saveUser({ username });
                    this.showToast('Welcome back, ' + username + '!', 'success');
                    setTimeout(() => window.location.href = 'index.html', 1000);
                } else {
                    this.showToast('Invalid username or password', 'error');
                }
            });
        }

        if (registerForm) {
            registerForm.addEventListener('submit', (e) => {
                e.preventDefault();
                const username = document.getElementById('regUsername').value.trim();
                const password = document.getElementById('regPassword').value;
                const confirm = document.getElementById('regConfirm').value;

                if (!username || !password) {
                    this.showToast('Please fill in all fields', 'warning');
                    return;
                }
                if (password !== confirm) {
                    this.showToast('Passwords do not match', 'error');
                    return;
                }
                if (password.length < 4) {
                    this.showToast('Password must be at least 4 characters', 'warning');
                    return;
                }

                const users = JSON.parse(localStorage.getItem('quietSpotUsers') || '{}');
                if (users[username]) {
                    this.showToast('Username already taken', 'error');
                    return;
                }

                users[username] = { password, created: Date.now() };
                localStorage.setItem('quietSpotUsers', JSON.stringify(users));
                this.saveUser({ username });
                this.showToast('Account created! Welcome, ' + username, 'success');
                setTimeout(() => window.location.href = 'index.html', 1000);
            });
        }
    },

    getSavedSpots() {
        const key = this.currentUser
            ? 'savedSpots_' + this.currentUser.username
            : 'savedSpots_guest';
        return JSON.parse(localStorage.getItem(key) || '[]');
    },

    saveSpot(spot) {
        const key = this.currentUser
            ? 'savedSpots_' + this.currentUser.username
            : 'savedSpots_guest';
        const spots = this.getSavedSpots();
        const exists = spots.some(s => s.id === spot.id);
        if (exists) {
            this.showToast('This spot is already saved!', 'warning');
            return false;
        }
        spots.push({ ...spot, savedAt: Date.now() });
        localStorage.setItem(key, JSON.stringify(spots));
        this.showToast('Spot saved! Check the homepage or Saved tab.', 'success');
        this.emit('spotsChanged');
        return true;
    },

    removeSpot(id) {
        const key = this.currentUser
            ? 'savedSpots_' + this.currentUser.username
            : 'savedSpots_guest';
        const spots = this.getSavedSpots().filter(s => s.id !== id);
        localStorage.setItem(key, JSON.stringify(spots));
        this.showToast('Spot removed', 'info');
        this.emit('spotsChanged');
    },

    _events: {},
    on(event, fn) {
        (this._events[event] = this._events[event] || []).push(fn);
    },
    emit(event, data) {
        (this._events[event] || []).forEach(fn => fn(data));
    },

    showToast(message, type = 'info') {
        const container = document.getElementById('toastContainer');
        if (!container) return;
        const toast = document.createElement('div');
        toast.className = 'toast ' + type;
        const icons = { success: '✅', warning: '⚠️', error: '❌', info: 'ℹ️' };
        toast.innerHTML = '<span>' + (icons[type] || '') + '</span><span>' + message + '</span>';
        container.appendChild(toast);
        setTimeout(() => toast.remove(), 4000);
    },

    renderSavedSpotsHome() {
        const grid = document.getElementById('savedSpotsGrid');
        const empty = document.getElementById('savedEmptyState');
        if (!grid) return;

        const spots = this.getSavedSpots();

        Array.from(grid.children).forEach(child => {
            if (child.id !== 'savedEmptyState') child.remove();
        });

        if (spots.length === 0) {
            empty.classList.remove('hidden');
            return;
        }
        empty.classList.add('hidden');

        spots.slice(0, 6).forEach(spot => {
            const card = document.createElement('div');
            card.className = 'saved-card';
            const date = spot.savedAt ? new Date(spot.savedAt).toLocaleDateString() : '';
            card.innerHTML = `
                <h4>${this.escapeHtml(spot.name || 'Unnamed Spot')}</h4>
                <p>${this.escapeHtml(spot.type || 'Location')} • ${spot.city || 'NYC'}</p>
                <p style="font-size:12px;opacity:0.6;margin-top:4px;">${date}</p>
                <div class="saved-actions">
                    <a href="map.html?lat=${spot.lat}&lng=${spot.lng}&zoom=16" class="btn-secondary btn-small">View</a>
                    <button class="btn-small" style="background:rgba(255,82,82,0.2);color:#ff5252;" onclick="App.removeSpot('${spot.id}'); App.renderSavedSpotsHome();">Remove</button>
                </div>
            `;
            grid.appendChild(card);
        });
    },

    renderFeaturedLibraries() {
        const grid = document.getElementById('featuredGrid');
        if (!grid) return;

        fetch('data/libraries.json')
            .then(r => r.json())
            .then(data => {
                const featured = [
                    data.find(l => l.name.includes('Schwarzman')),
                    data.find(l => l.name.includes('Schomburg')),
                    data.find(l => l.name.includes('Brooklyn Central')),
                    data.find(l => l.name.includes('Queens Central')),
                    data.find(l => l.name.includes('Bronx Library Center')),
                    data.find(l => l.name.includes('St. George'))
                ].filter(Boolean);

                featured.forEach(lib => {
                    const card = document.createElement('div');
                    card.className = 'library-card';
                    const systemColors = { NYPL: '#4ecdc4', BPL: '#ffe66d', QPL: '#a8e6cf' };
                    const sysColor = systemColors[lib.system] || '#b698fb';
                    const coords = lib.the_geom?.coordinates;
                    const lat = coords ? coords[1] : '';
                    const lng = coords ? coords[0] : '';
                    card.innerHTML = `
                        <span class="lib-system" style="background:${sysColor}33;color:${sysColor};">${lib.system}</span>
                        <h3>${this.escapeHtml(lib.name)}</h3>
                        <p class="lib-address">${this.escapeHtml(lib.housenum || '')} ${this.escapeHtml(lib.streetname || '')}, ${this.escapeHtml(lib.city || '')}</p>
                        <div class="lib-actions">
                            <a href="${lib.url}" target="_blank" class="btn-secondary btn-small">Website</a>
                            <button class="btn-small btn-primary" onclick="App.saveSpot({id:'${lib.name}',name:'${lib.name.replace(/'/g, "\\'")}',type:'Library',city:'${lib.city}',lat:${lat},lng:${lng},system:'${lib.system}'}); App.renderSavedSpotsHome();">⭐ Save</button>
                        </div>
                    `;
                    grid.appendChild(card);
                });
            })
            .catch(err => console.error('Failed to load libraries:', err));
    },

    countBoroughs() {
        fetch('data/libraries.json')
            .then(r => r.json())
            .then(data => {
                const counts = {};
                data.forEach(lib => {
                    counts[lib.borocode] = (counts[lib.borocode] || 0) + 1;
                });
                document.querySelectorAll('.borough-count').forEach(el => {
                    const bc = el.dataset.borough;
                    if (counts[bc]) {
                        el.textContent = counts[bc] + ' libraries';
                    }
                });
            });
    },

    animateStats() {
        const nums = document.querySelectorAll('.stat-num');
        nums.forEach(num => {
            const target = parseInt(num.dataset.target, 10);
            let current = 0;
            const step = Math.max(1, Math.floor(target / 40));
            const timer = setInterval(() => {
                current += step;
                if (current >= target) {
                    current = target;
                    clearInterval(timer);
                }
                num.textContent = current;
            }, 40);
        });
    },

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
};


