// Main app logic and screen navigation

const App = {
    currentScreen: 'login-screen',
    selectedPriorSession: null,
    authInitialized: false,

    async init() {
        // Initialize IndexedDB as fallback
        try {
            await StorageDB.init();
            console.log('Local storage initialized');
        } catch (error) {
            console.error('Failed to initialize local storage:', error);
        }

        // Set up event listeners
        this.setupNavigation();
        this.setupAuth();
        this.setupSpreading();
        this.setupExport();
        this.setupSettings();
        this.setupPriorSessions();

        // Initialize admin panel
        if (typeof AdminPanel !== 'undefined') {
            AdminPanel.init();
        }

        // Menu logout button
        const menuLogoutBtn = document.getElementById('menu-logout-btn');
        if (menuLogoutBtn) {
            menuLogoutBtn.addEventListener('click', async () => {
                if (confirm('Are you sure you want to logout?')) {
                    const authHandler = window.FirebaseAuth || Auth;
                    await authHandler.logout();
                    this.showScreen('login-screen');
                }
            });
        }

        // Listen for Firebase auth state changes
        window.addEventListener('authStateChanged', async (event) => {
            const user = event.detail.user;
            this.authInitialized = true;

            if (user) {
                console.log('User logged in:', user.email);
                this.updateUserDisplay({
                    email: user.email,
                    name: user.displayName || ''
                });
                // Check admin role and show/hide admin button
                await this.updateAdminVisibility();
                if (this.currentScreen === 'login-screen') {
                    this.showScreen('menu-screen');
                }
            } else {
                console.log('User logged out');
                this.hideAdminButton();
                this.showScreen('login-screen');
            }
        });

        // Show loading state initially, Firebase will trigger auth state change
        this.showScreen('login-screen');

        // Register service worker
        this.registerServiceWorker();
    },

    async registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            try {
                const registration = await navigator.serviceWorker.register('sw.js');
                console.log('Service Worker registered:', registration.scope);
            } catch (error) {
                console.error('Service Worker registration failed:', error);
            }
        }
    },

    showScreen(screenId) {
        // Hide all screens
        document.querySelectorAll('.screen').forEach(screen => {
            screen.classList.remove('active');
        });

        // Show target screen
        const targetScreen = document.getElementById(screenId);
        if (targetScreen) {
            targetScreen.classList.add('active');
            this.currentScreen = screenId;

            // Special handling for certain screens
            if (screenId === 'map-screen') {
                MapManager.init();
                MapManager.invalidateSize();
            } else if (screenId === 'export-screen') {
                ExportManager.renderLogsList();
            } else if (screenId === 'settings-screen') {
                this.loadSettings();
            } else if (screenId === 'load-screen') {
                this.renderPriorSessions();
            }
        }
    },

    setupNavigation() {
        // Menu buttons
        document.querySelectorAll('.btn-menu').forEach(btn => {
            btn.addEventListener('click', () => {
                const targetScreen = btn.dataset.screen;
                if (targetScreen) {
                    this.showScreen(targetScreen);
                }
            });
        });

        // Back buttons
        document.querySelectorAll('.btn-back').forEach(btn => {
            btn.addEventListener('click', () => {
                const targetScreen = btn.dataset.screen;
                if (targetScreen) {
                    this.showScreen(targetScreen);
                }
            });
        });
    },

    setupAuth() {
        const loginForm = document.getElementById('login-form');
        const registerForm = document.getElementById('register-form');
        const showRegisterLink = document.getElementById('show-register');
        const showLoginLink = document.getElementById('show-login');
        const authError = document.getElementById('auth-error');

        // Toggle between login and register forms
        showRegisterLink.addEventListener('click', (e) => {
            e.preventDefault();
            loginForm.classList.add('hidden');
            registerForm.classList.remove('hidden');
            authError.classList.add('hidden');
        });

        showLoginLink.addEventListener('click', (e) => {
            e.preventDefault();
            registerForm.classList.add('hidden');
            loginForm.classList.remove('hidden');
            authError.classList.add('hidden');
        });

        // Login form submission
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('login-email').value;
            const password = document.getElementById('login-password').value;

            // Use Firebase Auth if available, fallback to local Auth
            const authHandler = window.FirebaseAuth || Auth;
            const result = await authHandler.login(email, password);

            if (result.success) {
                authError.classList.add('hidden');
                this.updateUserDisplay(result.user);
                this.showScreen('menu-screen');
                loginForm.reset();
            } else {
                authError.textContent = result.error;
                authError.classList.remove('hidden');
            }
        });

        // Register form submission
        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('register-email').value;
            const name = document.getElementById('register-name').value;
            const password = document.getElementById('register-password').value;
            const confirm = document.getElementById('register-confirm').value;

            if (password !== confirm) {
                authError.textContent = 'Passwords do not match.';
                authError.classList.remove('hidden');
                return;
            }

            // Use Firebase Auth if available, fallback to local Auth
            const authHandler = window.FirebaseAuth || Auth;
            const result = await authHandler.register(email, password, name);

            if (result.success) {
                authError.classList.add('hidden');
                this.updateUserDisplay(result.user);
                this.showScreen('menu-screen');
                registerForm.reset();
            } else {
                authError.textContent = result.error;
                authError.classList.remove('hidden');
            }
        });
    },

    setupSpreading() {
        const startBtn = document.getElementById('start-spreading');
        const stopBtn = document.getElementById('stop-spreading');

        startBtn.addEventListener('click', async () => {
            const tractorColor = 'green'; // Default tractor color
            const manureColor = 'brown'; // Default manure color
            const targetRate = document.getElementById('target-rate').value;
            const spreadWidth = document.getElementById('spread-width').value || 50;

            this.showScreen('map-screen');

            // If there's a selected prior session, load it on the map
            if (this.selectedPriorSession) {
                MapManager.loadPriorSession(this.selectedPriorSession);
            }

            const result = await SpreadingTracker.startTracking(
                tractorColor,
                manureColor,
                targetRate ? parseFloat(targetRate) : null,
                parseFloat(spreadWidth),
                this.selectedPriorSession?.id || null
            );

            if (!result.success) {
                alert('Failed to start GPS tracking: ' + result.error);
            }
        });

        stopBtn.addEventListener('click', async () => {
            try {
                const log = await SpreadingTracker.stopTracking();

                if (log) {
                    const pointCount = log.path ? log.path.length : 0;
                    alert(`Spreading recorded!\n${pointCount} GPS points captured.`);
                }

                // Clear selected prior session
                this.selectedPriorSession = null;

                this.showScreen('menu-screen');
            } catch (error) {
                alert('Failed to save spreading log: ' + error.message);
            }
        });
    },

    setupPriorSessions() {
        const loadBtn = document.getElementById('load-prior-btn');

        loadBtn.addEventListener('click', () => {
            this.showScreen('load-screen');
        });
    },

    async renderPriorSessions() {
        const container = document.getElementById('prior-sessions-list');
        if (!container) return;

        try {
            // Use Firebase DB if available, fallback to local StorageDB
            const dbHandler = window.FirebaseDB || StorageDB;
            const logs = await dbHandler.getAllLogs();

            if (logs.length === 0) {
                container.innerHTML = '<p class="no-sessions">No prior sessions available.</p>';
                return;
            }

            let html = '';

            logs.forEach(log => {
                const date = ExportManager.formatDate(log.timestamp);
                const time = ExportManager.formatTime(log.timestamp);
                const duration = ExportManager.formatDuration(log.timestamp, log.endTime);
                const pointCount = log.path ? log.path.length : 0;
                const rateInfo = log.targetRate ? `${log.targetRate} gal/ac` : 'N/A';
                const widthInfo = log.spreadWidth ? `${log.spreadWidth} ft` : '50 ft';

                html += `
                    <div class="session-item" data-log-id="${log.id}">
                        <div class="session-date">${date} at ${time}</div>
                        <div class="session-details">
                            ${log.tractorColor} tractor, ${log.manureColor} manure
                            (${pointCount} GPS points)
                        </div>
                        <div class="session-settings">
                            Rate: ${rateInfo} | Width: ${widthInfo} | Duration: ${duration}
                        </div>
                    </div>
                `;
            });

            container.innerHTML = html;

            // Add click handlers to session items
            container.querySelectorAll('.session-item').forEach(item => {
                item.addEventListener('click', async () => {
                    const logId = item.dataset.logId;
                    await this.selectPriorSession(logId);
                });
            });

        } catch (error) {
            console.error('Failed to render prior sessions:', error);
            container.innerHTML = '<p class="no-sessions">Error loading sessions.</p>';
        }
    },

    async selectPriorSession(logId) {
        try {
            // Use Firebase DB if available, fallback to local StorageDB
            const dbHandler = window.FirebaseDB || StorageDB;
            const log = await dbHandler.getLogById(logId);

            if (!log) {
                alert('Session not found.');
                return;
            }

            this.selectedPriorSession = log;

            // Pre-fill the setup form with the prior session's settings
            if (log.targetRate) {
                document.getElementById('target-rate').value = log.targetRate;
            }
            if (log.spreadWidth) {
                document.getElementById('spread-width').value = log.spreadWidth;
            }

            // Navigate to setup screen with prior session loaded
            this.showScreen('setup-screen');

            alert('Prior session loaded. Click "Record Spread" to continue where you left off. The previous path will be shown on the map.');

        } catch (error) {
            console.error('Failed to load prior session:', error);
            alert('Failed to load prior session.');
        }
    },

    setupExport() {
        const exportAllBtn = document.getElementById('export-all');
        const exportTodayBtn = document.getElementById('export-today');

        exportAllBtn.addEventListener('click', () => {
            ExportManager.exportAllLogs();
        });

        exportTodayBtn.addEventListener('click', () => {
            ExportManager.exportTodaysLogs();
        });
    },

    setupSettings() {
        const settingsForm = document.getElementById('settings-form');
        const logoutBtn = document.getElementById('logout-btn');
        const settingsMessage = document.getElementById('settings-message');

        settingsForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('settings-email').value;
            const name = document.getElementById('settings-name').value;
            const newPassword = document.getElementById('settings-new-password').value;

            // Use Firebase Auth if available, fallback to local Auth
            const authHandler = window.FirebaseAuth || Auth;

            // Firebase only supports updating profile name, not email (without re-authentication)
            const result = await authHandler.updateProfile(name);

            if (result.success) {
                settingsMessage.textContent = 'Settings saved successfully!';
                settingsMessage.classList.remove('hidden');
                this.updateUserDisplay({ email, name });
                document.getElementById('settings-new-password').value = '';

                setTimeout(() => {
                    settingsMessage.classList.add('hidden');
                }, 3000);
            } else {
                alert('Failed to save settings: ' + result.error);
            }
        });

        logoutBtn.addEventListener('click', async () => {
            if (confirm('Are you sure you want to logout?')) {
                // Use Firebase Auth if available, fallback to local Auth
                const authHandler = window.FirebaseAuth || Auth;
                await authHandler.logout();
                this.showScreen('login-screen');
            }
        });
    },

    loadSettings() {
        // Use Firebase Auth if available, fallback to local Auth
        const authHandler = window.FirebaseAuth || Auth;
        const user = authHandler.getCurrentUser();
        if (user) {
            document.getElementById('settings-email').value = user.email;
            document.getElementById('settings-name').value = user.name || '';
            document.getElementById('settings-new-password').value = '';
        }
    },

    updateUserDisplay(user) {
        const nameElement = document.getElementById('user-name');
        if (nameElement) {
            nameElement.textContent = user.name || user.email.split('@')[0];
        }
    },

    async updateAdminVisibility() {
        const btn = document.getElementById('admin-panel-btn');
        if (!btn) return;

        // Wait for FirebaseAdmin to be available (module load timing)
        let attempts = 0;
        while (!window.FirebaseAdmin && attempts < 20) {
            await new Promise(r => setTimeout(r, 250));
            attempts++;
        }
        if (!window.FirebaseAdmin) return;

        try {
            const isAdmin = await FirebaseAdmin.isAdmin();
            btn.classList.toggle('hidden', !isAdmin);
        } catch (e) {
            btn.classList.add('hidden');
        }
    },

    hideAdminButton() {
        const btn = document.getElementById('admin-panel-btn');
        if (btn) btn.classList.add('hidden');
    }
};

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    App.init();
});
