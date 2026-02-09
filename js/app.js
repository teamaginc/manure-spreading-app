// Main app logic and screen navigation

const App = {
    currentScreen: 'login-screen',
    selectedPriorSession: null,
    authInitialized: false,
    loadCount: 0,

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

        // Initialize farm profile
        if (typeof FarmProfile !== 'undefined') {
            FarmProfile.init();
        }

        // Farm Profile button
        const farmProfileBtn = document.getElementById('farm-profile-btn');
        if (farmProfileBtn) {
            farmProfileBtn.addEventListener('click', () => {
                this.showScreen('farm-profile-screen');
            });
        }

        // Field map back button
        const fieldMapBackBtn = document.getElementById('field-map-back-btn');
        if (fieldMapBackBtn) {
            fieldMapBackBtn.addEventListener('click', () => {
                const wasAdmin = !!FieldEditor.adminFarmId;
                FieldEditor.cleanup();
                if (wasAdmin) {
                    App.showScreen('farmer-detail-screen');
                    if (AdminPanel.currentFarmerFarmId) {
                        AdminPanel.loadFarmerFarmFields(AdminPanel.currentFarmerFarmId);
                    }
                } else {
                    App.showScreen('farm-profile-screen');
                }
            });
        }

        // Storage geofence back button
        const sgBackBtn = document.getElementById('storage-geofence-back-btn');
        if (sgBackBtn) {
            sgBackBtn.addEventListener('click', () => {
                StorageGeofenceEditor.navigateBack();
            });
        }

        // Storage geofence save button
        const sgSaveBtn = document.getElementById('storage-geofence-save-btn');
        if (sgSaveBtn) {
            sgSaveBtn.addEventListener('click', () => {
                StorageGeofenceEditor.save();
            });
        }

        // Storage geofence clear button
        const sgClearBtn = document.getElementById('storage-geofence-clear-btn');
        if (sgClearBtn) {
            sgClearBtn.addEventListener('click', () => {
                StorageGeofenceEditor.clearGeofence();
            });
        }

        // Field save button
        const fieldSaveBtn = document.getElementById('field-save-btn');
        if (fieldSaveBtn) {
            fieldSaveBtn.addEventListener('click', () => {
                FieldEditor.saveField();
            });
        }

        // Past Records button
        const pastRecordsBtn = document.getElementById('past-records-btn');
        if (pastRecordsBtn) {
            pastRecordsBtn.addEventListener('click', () => {
                this.showScreen('past-records-screen');
            });
        }

        // Past Records back button
        const pastRecordsBackBtn = document.getElementById('past-records-back-btn');
        if (pastRecordsBackBtn) {
            pastRecordsBackBtn.addEventListener('click', () => {
                const wasAdmin = !!PastRecords.adminFarmId;
                PastRecords.cleanup();
                if (wasAdmin) {
                    this.showScreen('farmer-detail-screen');
                } else {
                    this.showScreen('menu-screen');
                }
            });
        }

        // Edit Record back button
        const editRecordBackBtn = document.getElementById('edit-record-back-btn');
        if (editRecordBackBtn) {
            editRecordBackBtn.addEventListener('click', () => {
                RecordEditor.cleanup();
                this.showScreen('past-records-screen');
                setTimeout(() => PastRecords.init(), 150);
            });
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

        // Setup sidebar navigation
        this.setupSidebar();

        // Setup past records export all button
        const exportAllBtn = document.getElementById('past-records-export-all');
        if (exportAllBtn) {
            exportAllBtn.addEventListener('click', () => {
                ExportManager.exportAllLogs();
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
                document.body.classList.add('has-sidebar');
                // Check admin role and show/hide admin button
                await this.updateAdminVisibility();
                if (this.currentScreen === 'login-screen') {
                    this.showScreen('menu-screen');
                }
                // Check pending invites
                if (typeof FarmProfile !== 'undefined') {
                    FarmProfile.checkPendingInvites();
                }
                // Check for announcements
                this.checkAndShowAnnouncements();
                // Check experimental features availability
                this.checkExperimentalFeatures();
            } else {
                console.log('User logged out');
                document.body.classList.remove('has-sidebar');
                this.hideAdminButton();
                this.hideAnnouncement();
                this.showScreen('login-screen');
            }
        });

        // Setup announcement dismiss button
        const dismissBtn = document.getElementById('dismiss-announcement');
        if (dismissBtn) {
            dismissBtn.addEventListener('click', () => this.dismissAnnouncement());
        }

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
        // Clean up setup screen when leaving
        if (this.currentScreen === 'setup-screen' && screenId !== 'setup-screen') {
            this.cleanupSetupScreen();
        }

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
            } else if (screenId === 'menu-screen') {
                // On desktop, load farm map if user has fields
                if (window.innerWidth >= 768) {
                    this.loadDesktopFarmMap();
                }
            } else if (screenId !== 'menu-screen') {
                // Destroy desktop farm map when leaving menu screen
                this.destroyDesktopFarmMap();
            }

            if (screenId === 'export-screen') {
                ExportManager.renderLogsList();
            } else if (screenId === 'settings-screen') {
                this.loadSettings();
            } else if (screenId === 'setup-screen') {
                this.populateSetupDropdowns();
                // Reset user-selected flag and add listener
                const fieldSelect = document.getElementById('setup-field');
                if (fieldSelect) {
                    fieldSelect.dataset.userSelected = 'false';
                    fieldSelect.addEventListener('change', () => {
                        fieldSelect.dataset.userSelected = 'true';
                    }, { once: true });
                }
            } else if (screenId === 'load-screen') {
                this.renderPriorSessions();
            } else if (screenId === 'farm-profile-screen') {
                if (typeof FarmProfile !== 'undefined') FarmProfile.load();
            } else if (screenId === 'storage-geofence-screen') {
                // StorageGeofenceEditor.init() is called by the caller before showScreen
                setTimeout(() => {
                    if (StorageGeofenceEditor.map) StorageGeofenceEditor.map.invalidateSize();
                }, 100);
            } else if (screenId === 'field-map-screen') {
                setTimeout(() => {
                    if (typeof FieldEditor !== 'undefined') FieldEditor.init();
                }, 100);
            } else if (screenId === 'past-records-screen') {
                setTimeout(() => {
                    if (typeof PastRecords !== 'undefined') PastRecords.init();
                }, 100);
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

    showNewLoadModal() {
        return new Promise((resolve) => {
            const modal = document.getElementById('new-load-modal');
            const yesBtn = document.getElementById('new-load-yes');
            const noBtn = document.getElementById('new-load-no');

            const cleanup = (result) => {
                modal.classList.add('hidden');
                yesBtn.removeEventListener('click', onYes);
                noBtn.removeEventListener('click', onNo);
                resolve(result);
            };

            const onYes = () => cleanup(true);
            const onNo = () => cleanup(false);

            yesBtn.addEventListener('click', onYes);
            noBtn.addEventListener('click', onNo);
            modal.classList.remove('hidden');
        });
    },

    async getEquipmentCapacity(equipId) {
        try {
            if (!this.setupSelectedFarmId || !window.FirebaseFarm) return null;
            const equipment = await FirebaseFarm.getEquipment(this.setupSelectedFarmId);
            const equip = equipment.find(e => e.id === equipId);
            return equip ? parseFloat(equip.capacity) || null : null;
        } catch (e) {
            console.error('Error getting equipment capacity:', e);
            return null;
        }
    },

    setupSpreading() {
        const startBtn = document.getElementById('start-spreading');
        const stopBtn = document.getElementById('stop-spreading');

        startBtn.addEventListener('click', async () => {
            // Show "New Load?" modal first
            const isNewLoad = await this.showNewLoadModal();
            if (isNewLoad) {
                this.loadCount++;
            }

            const targetRate = document.getElementById('target-rate').value;
            const spreadWidth = document.getElementById('spread-width').value || 50;

            // Get equipment, storage, and field selections
            const equipSelect = document.getElementById('setup-equipment');
            const storageSelect = document.getElementById('setup-storage');
            const fieldSelect = document.getElementById('setup-field');
            const selectedEquipment = equipSelect ? equipSelect.options[equipSelect.selectedIndex] : null;
            const selectedStorage = storageSelect ? storageSelect.options[storageSelect.selectedIndex] : null;
            const selectedField = fieldSelect ? fieldSelect.options[fieldSelect.selectedIndex] : null;

            // Get equipment capacity for calculated rate
            let equipmentCapacity = null;
            if (selectedEquipment && selectedEquipment.value) {
                equipmentCapacity = await this.getEquipmentCapacity(selectedEquipment.value);
            }

            this.showScreen('map-screen');

            // Update load counter display
            const loadCounterEl = document.getElementById('load-counter');
            if (loadCounterEl) {
                loadCounterEl.textContent = `Load: ${this.loadCount}`;
                loadCounterEl.classList.remove('hidden');
            }

            // Show calc rate display if we have equipment capacity
            const calcRateEl = document.getElementById('calc-rate-display');
            if (calcRateEl && equipmentCapacity) {
                calcRateEl.classList.remove('hidden');
            }

            // If there's a selected prior session, load it on the map
            if (this.selectedPriorSession) {
                MapManager.loadPriorSession(this.selectedPriorSession);
            }

            const result = await SpreadingTracker.startTracking(
                targetRate ? parseFloat(targetRate) : null,
                parseFloat(spreadWidth),
                this.selectedPriorSession?.id || null
            );

            // Set equipment capacity and load count on tracker
            SpreadingTracker.equipmentCapacity = equipmentCapacity;
            SpreadingTracker.loadCount = this.loadCount;

            // Attach equipment/storage/field/farm info to the log and tracker
            if (SpreadingTracker.currentLog) {
                SpreadingTracker.currentLog.loadCount = this.loadCount;
                SpreadingTracker.currentLog.equipmentCapacity = equipmentCapacity;

                // Save farm info
                if (this.setupSelectedFarmId) {
                    SpreadingTracker.currentLog.farmId = this.setupSelectedFarmId;
                    const selectedFarm = this.setupUserFarms.find(f => f.id === this.setupSelectedFarmId);
                    if (selectedFarm) {
                        SpreadingTracker.currentLog.farmName = selectedFarm.name;
                    }
                    // Remember for next time
                    localStorage.setItem('lastSpreadFarmId', this.setupSelectedFarmId);
                }

                if (selectedEquipment && selectedEquipment.value) {
                    SpreadingTracker.currentLog.equipmentId = selectedEquipment.value;
                    SpreadingTracker.currentLog.equipmentName = selectedEquipment.textContent;
                }
                if (selectedStorage && selectedStorage.value) {
                    SpreadingTracker.currentLog.storageId = selectedStorage.value;
                    SpreadingTracker.currentLog.storageName = selectedStorage.textContent;
                }
                if (selectedField && selectedField.value) {
                    SpreadingTracker.currentLog.fieldId = selectedField.value;
                    SpreadingTracker.currentLog.fieldName = selectedField.textContent;
                }
            }

            // Set field info for field crossing detection
            const fieldId = selectedField?.value || null;
            const fieldName = selectedField?.value ? selectedField.textContent : null;
            SpreadingTracker.setFieldInfo(fieldId, fieldName, this.setupMapFields || []);

            // Load storage geofences if feature is enabled globally and for this farm
            if (this.setupSelectedFarmId && window.FirebaseFarm && window.FirebaseAdmin) {
                try {
                    const globalFeatures = await FirebaseAdmin.getGlobalFeatures();
                    const globalEnabled = !!(globalFeatures && globalFeatures.storageGeofencing && globalFeatures.storageGeofencing.enabled);

                    if (globalEnabled) {
                        const farmFeatures = await FirebaseFarm.getFarmFeatures(this.setupSelectedFarmId);
                        if (farmFeatures && farmFeatures.storageGeofencing) {
                            const storages = await FirebaseFarm.getStorages(this.setupSelectedFarmId);
                            const geofenced = storages.filter(s => s.hasGeofence && s.geojson);
                            if (geofenced.length > 0) {
                                SpreadingTracker.setStorageGeofences(geofenced);
                                MapManager.addStorageGeofences(geofenced);
                            }
                        }
                    }
                } catch (e) {
                    console.error('Error loading storage geofences:', e);
                }
            }

            if (!result.success) {
                alert('Failed to start GPS tracking: ' + result.error);
            }
        });

        stopBtn.addEventListener('click', async () => {
            try {
                const log = await SpreadingTracker.stopTracking();

                if (log) {
                    const pointCount = log.path ? log.path.length : 0;
                    let msg = `Spreading recorded!\n${pointCount} GPS points captured.`;
                    if (log.calculatedRate) {
                        msg += `\nCalculated rate: ${log.calculatedRate.toFixed(0)} gal/ac`;
                    }
                    alert(msg);
                }

                // Hide load counter and calc rate display
                const loadCounterEl = document.getElementById('load-counter');
                if (loadCounterEl) loadCounterEl.classList.add('hidden');
                const calcRateEl = document.getElementById('calc-rate-display');
                if (calcRateEl) calcRateEl.classList.add('hidden');

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
                            ${pointCount} GPS points
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

        // Auto-start on charging toggle
        const autostartToggle = document.getElementById('user-autostart-charging-toggle');
        if (autostartToggle) {
            // Load saved preference
            autostartToggle.checked = localStorage.getItem('autostartOnCharging') === 'true';

            autostartToggle.addEventListener('change', () => {
                localStorage.setItem('autostartOnCharging', autostartToggle.checked);
                if (autostartToggle.checked) {
                    this.setupChargingDetection();
                }
            });
        }
    },

    // Check and show experimental features in user settings
    async checkExperimentalFeatures() {
        const experimentalSection = document.getElementById('user-experimental-features');
        if (!experimentalSection) return;

        try {
            if (window.FirebaseAdmin) {
                const globalFeatures = await FirebaseAdmin.getGlobalFeatures();
                const autostartEnabled = !!(globalFeatures && globalFeatures.autostartCharging && globalFeatures.autostartCharging.enabled);

                if (autostartEnabled) {
                    experimentalSection.classList.remove('hidden');
                    // Set up charging detection if user has it enabled
                    if (localStorage.getItem('autostartOnCharging') === 'true') {
                        this.setupChargingDetection();
                    }
                } else {
                    experimentalSection.classList.add('hidden');
                }
            }
        } catch (e) {
            console.error('Error checking experimental features:', e);
        }
    },

    // Battery API charging detection
    batteryManager: null,
    chargingHandler: null,

    async setupChargingDetection() {
        if (!('getBattery' in navigator)) {
            console.warn('Battery API not supported');
            return;
        }

        try {
            this.batteryManager = await navigator.getBattery();

            // Remove old handler if exists
            if (this.chargingHandler) {
                this.batteryManager.removeEventListener('chargingchange', this.chargingHandler);
            }

            this.chargingHandler = () => this.onChargingChange();
            this.batteryManager.addEventListener('chargingchange', this.chargingHandler);

            console.log('Charging detection enabled, current charging state:', this.batteryManager.charging);
        } catch (e) {
            console.error('Failed to set up charging detection:', e);
        }
    },

    async onChargingChange() {
        if (!this.batteryManager) return;

        const isCharging = this.batteryManager.charging;
        const autostartEnabled = localStorage.getItem('autostartOnCharging') === 'true';

        if (!autostartEnabled) return;

        // Only auto-start/stop if on setup screen
        if (this.currentScreen === 'setup-screen' && isCharging) {
            console.log('Charging started - auto-starting spreading');
            // Simulate clicking the start button
            const startBtn = document.getElementById('start-spreading');
            if (startBtn && !startBtn.disabled) {
                startBtn.click();
            }
        } else if (this.currentScreen === 'map-screen' && !isCharging) {
            console.log('Charging stopped - auto-stopping spreading');
            // Simulate clicking the stop button
            const stopBtn = document.getElementById('stop-spreading');
            if (stopBtn) {
                stopBtn.click();
            }
        }
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
            const sidebarBtn = document.getElementById('sidebar-admin-panel');
            if (sidebarBtn) sidebarBtn.classList.toggle('hidden', !isAdmin);
        } catch (e) {
            btn.classList.add('hidden');
        }
    },

    setupMap: null,
    setupMapFields: [],
    setupTractorMarker: null,
    setupWatchId: null,
    setupCurrentPosition: null,
    setupUserFarms: [],
    setupSelectedFarmId: null,

    async populateSetupDropdowns() {
        const user = window.FirebaseAuth && FirebaseAuth.getCurrentUser();
        const farmSelect = document.getElementById('setup-farm');
        const farmGroup = document.getElementById('setup-farm-group');
        const fieldSelect = document.getElementById('setup-field');
        const equipSelect = document.getElementById('setup-equipment');
        const storageSelect = document.getElementById('setup-storage');

        // Reset dropdowns
        if (fieldSelect) fieldSelect.innerHTML = '<option value="">No Field (optional)</option>';
        if (equipSelect) equipSelect.innerHTML = '<option value="">Select equipment...</option>';
        if (storageSelect) storageSelect.innerHTML = '<option value="">Select storage...</option>';

        // Initialize map even without farm data - but start GPS to show user location
        this.initSetupMap([]);
        this.startSetupGpsTracking([]);  // Start GPS immediately to show location

        if (!user || !window.FirebaseFarm) return;

        // Wait for FirebaseAdmin to be available (ES module timing)
        let attempts = 0;
        while (!window.FirebaseAdmin && attempts < 20) {
            await new Promise(r => setTimeout(r, 100));
            attempts++;
        }
        if (!window.FirebaseAdmin) {
            console.warn('FirebaseAdmin not available after waiting');
            return;
        }

        try {
            // Get all farms user is a member of
            console.log('Fetching farms for user:', user.uid);
            this.setupUserFarms = await FirebaseAdmin.getFarmsForUser(user.uid);
            console.log('Found farms:', this.setupUserFarms);

            if (this.setupUserFarms.length === 0) {
                // No farms - hide farm selector
                console.log('No farms found for user');
                if (farmGroup) farmGroup.style.display = 'none';
                return;
            }

            // Show farm selector
            if (farmGroup) farmGroup.style.display = '';

            if (this.setupUserFarms.length === 1) {
                // Only one farm - auto-select it
                console.log('Single farm, auto-selecting:', this.setupUserFarms[0].name);
                if (farmSelect) {
                    farmSelect.innerHTML = `<option value="${this.setupUserFarms[0].id}">${this.setupUserFarms[0].name || 'Unnamed Farm'}</option>`;
                }
                this.setupSelectedFarmId = this.setupUserFarms[0].id;
                await this.loadFarmDataForSetup(this.setupUserFarms[0].id);
            } else {
                // Multiple farms - let user choose
                console.log('Multiple farms found:', this.setupUserFarms.length);
                if (farmSelect) {
                    farmSelect.innerHTML = '<option value="">Select farm...</option>' +
                        this.setupUserFarms.map(f => {
                            const roleLabel = f.memberRole === 'owner' ? ' (Owner)' : '';
                            return `<option value="${f.id}">${f.name || 'Unnamed Farm'}${roleLabel}</option>`;
                        }).join('');

                    // Add change listener (only once)
                    if (!farmSelect.dataset.listenerAdded) {
                        farmSelect.dataset.listenerAdded = 'true';
                        farmSelect.addEventListener('change', async () => {
                            this.setupSelectedFarmId = farmSelect.value;
                            if (farmSelect.value) {
                                await this.loadFarmDataForSetup(farmSelect.value);
                            } else {
                                // Reset if no farm selected
                                if (document.getElementById('setup-field')) {
                                    document.getElementById('setup-field').innerHTML = '<option value="">No Field (optional)</option>';
                                }
                                if (document.getElementById('setup-equipment')) {
                                    document.getElementById('setup-equipment').innerHTML = '<option value="">Select equipment...</option>';
                                }
                                if (document.getElementById('setup-storage')) {
                                    document.getElementById('setup-storage').innerHTML = '<option value="">Select storage...</option>';
                                }
                                this.setupTrackingFields = [];
                                this.initSetupMapWithFields([]);
                            }
                        });
                    }
                }

                // Try to auto-select the last used farm or user's own farm
                const lastFarmId = localStorage.getItem('lastSpreadFarmId');
                const userDoc = await FirebaseAdmin.getUserDoc(user.uid);
                const defaultFarmId = lastFarmId || userDoc?.farmId;

                if (defaultFarmId && this.setupUserFarms.some(f => f.id === defaultFarmId)) {
                    console.log('Auto-selecting default farm:', defaultFarmId);
                    if (farmSelect) farmSelect.value = defaultFarmId;
                    this.setupSelectedFarmId = defaultFarmId;
                    await this.loadFarmDataForSetup(defaultFarmId);
                }
            }

        } catch (e) {
            console.error('Error populating setup dropdowns:', e);
        }
    },

    async loadFarmDataForSetup(farmId) {
        const fieldSelect = document.getElementById('setup-field');
        const equipSelect = document.getElementById('setup-equipment');
        const storageSelect = document.getElementById('setup-storage');

        try {
            // Load equipment
            let equipment = [];
            if (equipSelect) {
                equipment = await FirebaseFarm.getEquipment(farmId);
                equipSelect.innerHTML = '<option value="">Select equipment...</option>' +
                    equipment.map(eq => `<option value="${eq.id}">${eq.name} (${eq.type} - ${eq.capacity} ${eq.units})</option>`).join('');
            }

            // Load storages
            let storages = [];
            if (storageSelect) {
                storages = await FirebaseFarm.getStorages(farmId);
                storageSelect.innerHTML = '<option value="">Select storage...</option>' +
                    storages.map(s => `<option value="${s.id}">${s.name}${s.source ? ' (' + s.source + ')' : ''} - ${s.capacity} ${s.units}</option>`).join('');
            }

            // Load fields
            const fields = await FirebaseFarm.getFarmFields(farmId);
            this.setupMapFields = fields;
            if (fieldSelect) {
                fieldSelect.innerHTML = '<option value="">No Field (optional)</option>' +
                    fields.map(f => `<option value="${f.id}">${f.name || 'Unnamed'}</option>`).join('');
            }

            // Re-initialize map with fields (keeps user's location if already tracking)
            this.initSetupMapWithFields(fields);

            // Auto-populate from last spread
            await this.autoPopulateFromLastSpread(equipment, storages, fields);

            // Update the fields being tracked for auto-select (GPS already running)
            this.setupTrackingFields = fields;
            this.setupMapFields = fields;

            // If we have a current position, auto-select field now
            if (this.setupCurrentPosition && fields.length > 0) {
                this.autoSelectFieldByLocation(
                    this.setupCurrentPosition.lat,
                    this.setupCurrentPosition.lng,
                    fields
                );
            }

        } catch (e) {
            console.error('Error loading farm data for setup:', e);
        }
    },

    async autoPopulateFromLastSpread(equipment, storages, fields) {
        try {
            const dbHandler = window.FirebaseDB || StorageDB;
            const logs = await dbHandler.getAllLogs();
            if (!logs || logs.length === 0) return;

            // Get most recent log
            logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
            const lastLog = logs[0];

            // Auto-populate equipment
            if (lastLog.equipmentId) {
                const equipSelect = document.getElementById('setup-equipment');
                if (equipSelect) equipSelect.value = lastLog.equipmentId;
            }

            // Auto-populate storage
            if (lastLog.storageId) {
                const storageSelect = document.getElementById('setup-storage');
                if (storageSelect) storageSelect.value = lastLog.storageId;
            }

            // Auto-populate target rate
            if (lastLog.targetRate) {
                const targetRateInput = document.getElementById('target-rate');
                if (targetRateInput) targetRateInput.value = lastLog.targetRate;
            }

            // Auto-populate spread width
            if (lastLog.spreadWidth) {
                const spreadWidthInput = document.getElementById('spread-width');
                if (spreadWidthInput) spreadWidthInput.value = lastLog.spreadWidth;
            }

        } catch (e) {
            console.error('Error auto-populating from last spread:', e);
        }
    },

    setupFieldLayers: [],

    initSetupMap(fields) {
        const mapContainer = document.getElementById('setup-map');
        if (!mapContainer) return;

        // Clean up existing map
        if (this.setupMap) {
            this.setupMap.remove();
            this.setupMap = null;
        }
        this.setupFieldLayers = [];
        this.setupTractorMarker = null;
        this.setupMapCentered = false;

        this.setupMap = L.map('setup-map', {
            zoomControl: true,
            attributionControl: false
        }).setView([43.0, -89.4], 15);

        L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
            maxZoom: 19
        }).addTo(this.setupMap);

        // Add field boundaries if provided
        this.addFieldsToSetupMap(fields);

        // Invalidate size after render
        setTimeout(() => {
            if (this.setupMap) this.setupMap.invalidateSize();
        }, 100);
    },

    initSetupMapWithFields(fields) {
        // If no map exists, create it
        if (!this.setupMap) {
            this.initSetupMap(fields);
            return;
        }

        // Clear existing field layers but keep tractor marker
        this.setupFieldLayers.forEach(layer => {
            this.setupMap.removeLayer(layer);
        });
        this.setupFieldLayers = [];

        // Add new field boundaries
        this.addFieldsToSetupMap(fields);

        // If we have fields and no current position, fit to field bounds
        // But if we have a current position, don't move the map
        if (fields.length > 0 && !this.setupCurrentPosition) {
            let bounds = null;
            fields.forEach(field => {
                if (!field.geojson) return;
                try {
                    const layer = L.geoJSON(field.geojson);
                    if (!bounds) {
                        bounds = layer.getBounds();
                    } else {
                        bounds.extend(layer.getBounds());
                    }
                } catch (e) {}
            });
            if (bounds && bounds.isValid()) {
                this.setupMap.fitBounds(bounds, { padding: [30, 30] });
            }
        }
    },

    addFieldsToSetupMap(fields) {
        if (!this.setupMap || !fields) return;

        fields.forEach(field => {
            if (!field.geojson) return;

            try {
                const layer = L.geoJSON(field.geojson, {
                    style: {
                        color: '#39FF14',
                        weight: 3,
                        fillOpacity: 0
                    }
                }).addTo(this.setupMap);
                this.setupFieldLayers.push(layer);

                // Add label
                const center = layer.getBounds().getCenter();
                const tooltip = L.tooltip({
                    permanent: true,
                    direction: 'center',
                    className: 'field-label-tooltip'
                }).setContent(field.name || 'Unnamed').setLatLng(center);
                this.setupMap.addLayer(tooltip);
                this.setupFieldLayers.push(tooltip);
            } catch (e) {
                console.warn('Error adding field to map:', e);
            }
        });
    },

    startSetupGpsTracking(fields) {
        // Stop any existing tracking
        this.stopSetupGpsTracking();

        if (!navigator.geolocation) {
            console.warn('Geolocation not available');
            return;
        }

        // Store the fields for this tracking session
        this.setupTrackingFields = fields || [];

        // Set a timeout to stop waiting for GPS after 10 seconds
        this.setupGpsTimeout = setTimeout(() => {
            if (!this.setupCurrentPosition) {
                console.warn('GPS timeout - no position received');
                // Field dropdown already has "No Field" as default, so user can proceed
            }
        }, 10000);

        this.setupWatchId = navigator.geolocation.watchPosition(
            (position) => {
                // Clear the timeout since we got a position
                if (this.setupGpsTimeout) {
                    clearTimeout(this.setupGpsTimeout);
                    this.setupGpsTimeout = null;
                }

                const { latitude, longitude } = position.coords;
                this.setupCurrentPosition = { lat: latitude, lng: longitude };

                // Update tractor marker on map
                if (this.setupMap) {
                    if (this.setupTractorMarker) {
                        this.setupTractorMarker.setLatLng([latitude, longitude]);
                    } else {
                        this.setupTractorMarker = L.marker([latitude, longitude], {
                            icon: L.divIcon({
                                className: 'tractor-icon',
                                html: '<div style="font-size:24px;text-shadow:0 0 3px #fff;">🚜</div>',
                                iconSize: [30, 30],
                                iconAnchor: [15, 15]
                            })
                        }).addTo(this.setupMap);
                    }

                    // Center map on tractor if first position (or no fields yet)
                    if (!this.setupMapCentered) {
                        this.setupMap.setView([latitude, longitude], 18);
                        this.setupMapCentered = true;
                    }
                }

                // Auto-select field based on location (only if we have fields)
                if (this.setupTrackingFields && this.setupTrackingFields.length > 0) {
                    this.autoSelectFieldByLocation(latitude, longitude, this.setupTrackingFields);
                }
            },
            (error) => {
                console.warn('Setup GPS error:', error.message);
                // Clear timeout on error too
                if (this.setupGpsTimeout) {
                    clearTimeout(this.setupGpsTimeout);
                    this.setupGpsTimeout = null;
                }
            },
            { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }
        );
    },

    stopSetupGpsTracking() {
        if (this.setupWatchId !== null) {
            navigator.geolocation.clearWatch(this.setupWatchId);
            this.setupWatchId = null;
        }
        if (this.setupGpsTimeout) {
            clearTimeout(this.setupGpsTimeout);
            this.setupGpsTimeout = null;
        }
        this.setupMapCentered = false;
    },

    autoSelectFieldByLocation(lat, lng, fields) {
        const fieldSelect = document.getElementById('setup-field');
        if (!fieldSelect) return;

        // Don't auto-select if user has manually selected
        if (fieldSelect.dataset.userSelected === 'true') return;

        for (const field of fields) {
            if (!field.geojson) continue;

            const polygon = this.getFieldPolygonCoords(field);
            if (polygon.length === 0) continue;

            if (this.pointInPolygon([lat, lng], polygon)) {
                fieldSelect.value = field.id;
                return;
            }
        }

        // Not in any field - find closest field
        let closestField = null;
        let closestDist = Infinity;

        for (const field of fields) {
            if (!field.geojson) continue;
            const center = this.getFieldCenter(field);
            if (!center) continue;

            const dist = this.calcDistance(lat, lng, center.lat, center.lng);
            if (dist < closestDist) {
                closestDist = dist;
                closestField = field;
            }
        }

        if (closestField) {
            fieldSelect.value = closestField.id;
        }
    },

    getFieldPolygonCoords(field) {
        const coords = [];
        if (!field.geojson) return coords;

        const features = field.geojson.features || [field.geojson];
        features.forEach(feature => {
            const geom = feature.geometry || feature;
            if (geom.type === 'Polygon') {
                geom.coordinates[0].forEach(c => coords.push([c[1], c[0]]));
            } else if (geom.type === 'MultiPolygon') {
                geom.coordinates.forEach(poly => {
                    poly[0].forEach(c => coords.push([c[1], c[0]]));
                });
            }
        });
        return coords;
    },

    getFieldCenter(field) {
        const coords = this.getFieldPolygonCoords(field);
        if (coords.length === 0) return null;
        const lat = coords.reduce((sum, c) => sum + c[0], 0) / coords.length;
        const lng = coords.reduce((sum, c) => sum + c[1], 0) / coords.length;
        return { lat, lng };
    },

    pointInPolygon(point, polygon) {
        const x = point[0], y = point[1];
        let inside = false;
        for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
            const xi = polygon[i][0], yi = polygon[i][1];
            const xj = polygon[j][0], yj = polygon[j][1];
            const intersect = ((yi > y) !== (yj > y)) &&
                (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
            if (intersect) inside = !inside;
        }
        return inside;
    },

    calcDistance(lat1, lng1, lat2, lng2) {
        const R = 6371000;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLng = (lng2 - lng1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    },

    cleanupSetupScreen() {
        this.stopSetupGpsTracking();
        if (this.setupMap) {
            this.setupMap.remove();
            this.setupMap = null;
        }
        this.setupTractorMarker = null;
    },

    hideAdminButton() {
        const btn = document.getElementById('admin-panel-btn');
        if (btn) btn.classList.add('hidden');
        const sidebarBtn = document.getElementById('sidebar-admin-panel');
        if (sidebarBtn) sidebarBtn.classList.add('hidden');
    },

    currentAnnouncementId: null,
    dismissedAnnouncements: JSON.parse(localStorage.getItem('dismissedAnnouncements') || '[]'),

    async checkAndShowAnnouncements() {
        if (!window.FirebaseAdmin) return;

        try {
            const announcements = await FirebaseAdmin.getActiveAnnouncements();
            if (!announcements || announcements.length === 0) {
                this.hideAnnouncement();
                return;
            }

            // Find first non-dismissed announcement
            const announcement = announcements.find(a =>
                !this.dismissedAnnouncements.includes(a.id) || !a.dismissible
            );

            if (announcement) {
                this.showAnnouncement(announcement);
            } else {
                this.hideAnnouncement();
            }
        } catch (e) {
            console.error('Failed to check announcements:', e);
        }
    },

    showAnnouncement(announcement) {
        const banner = document.getElementById('announcement-banner');
        const icon = banner.querySelector('.announcement-banner-icon');
        const text = banner.querySelector('.announcement-banner-text');
        const dismissBtn = document.getElementById('dismiss-announcement');

        if (!banner) return;

        // Set content
        const icons = {
            'info': 'ℹ️',
            'feature': '✨',
            'warning': '⚠️',
            'maintenance': '🔧'
        };
        icon.textContent = icons[announcement.type] || 'ℹ️';
        text.innerHTML = `<strong>${announcement.title}</strong> ${announcement.message}`;

        // Set type class for styling
        banner.className = 'announcement-banner';
        banner.classList.add(`announcement-type-${announcement.type || 'info'}`);

        // Show/hide dismiss button
        if (dismissBtn) {
            dismissBtn.style.display = announcement.dismissible ? '' : 'none';
        }

        this.currentAnnouncementId = announcement.id;
        banner.classList.remove('hidden');
    },

    hideAnnouncement() {
        const banner = document.getElementById('announcement-banner');
        if (banner) {
            banner.classList.add('hidden');
        }
        this.currentAnnouncementId = null;
    },

    dismissAnnouncement() {
        if (this.currentAnnouncementId) {
            this.dismissedAnnouncements.push(this.currentAnnouncementId);
            localStorage.setItem('dismissedAnnouncements', JSON.stringify(this.dismissedAnnouncements));
        }
        this.hideAnnouncement();
        // Check for next announcement
        setTimeout(() => this.checkAndShowAnnouncements(), 100);
    },

    desktopFarmMap: null,
    desktopFarmMapLayers: [],

    async loadDesktopFarmMap() {
        const menuScreen = document.getElementById('menu-screen');
        const mapContainer = document.getElementById('desktop-farm-map');
        const subtitle = document.getElementById('desktop-subtitle');

        if (!mapContainer || !menuScreen) return;

        try {
            const user = window.FirebaseAuth && FirebaseAuth.getCurrentUser();
            if (!user || !window.FirebaseFarm) {
                // No user or Firebase not available - show background + subtitle
                menuScreen.classList.remove('has-farm-map');
                mapContainer.classList.remove('active');
                return;
            }

            const farm = await FirebaseFarm.getFarmByUser(user.uid);
            if (!farm) {
                // No farm - show background + subtitle
                menuScreen.classList.remove('has-farm-map');
                mapContainer.classList.remove('active');
                return;
            }

            const fields = await FirebaseFarm.getFarmFields(farm.id);

            if (!fields || fields.length === 0) {
                // No fields - show background + subtitle
                menuScreen.classList.remove('has-farm-map');
                mapContainer.classList.remove('active');
                return;
            }

            // Has fields - show the map
            menuScreen.classList.add('has-farm-map');
            mapContainer.classList.add('active');

            // Initialize or update the map
            if (!this.desktopFarmMap) {
                this.desktopFarmMap = L.map('desktop-farm-map', {
                    zoomControl: true,
                    attributionControl: false
                }).setView([43.0, -89.4], 15);

                L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
                    maxZoom: 19,
                    attribution: 'Tiles &copy; Esri'
                }).addTo(this.desktopFarmMap);
            }

            // Clear existing layers
            this.desktopFarmMapLayers.forEach(layer => this.desktopFarmMap.removeLayer(layer));
            this.desktopFarmMapLayers = [];

            // Add field boundaries
            let bounds = null;
            fields.forEach(field => {
                if (!field.geojson) return;

                const layer = L.geoJSON(field.geojson, {
                    style: {
                        color: '#39FF14',
                        weight: 3,
                        fillOpacity: 0
                    }
                }).addTo(this.desktopFarmMap);

                this.desktopFarmMapLayers.push(layer);

                // Add label
                const center = layer.getBounds().getCenter();
                const label = L.tooltip({
                    permanent: true,
                    direction: 'center',
                    className: 'field-label-tooltip'
                }).setContent(field.name || 'Unnamed').setLatLng(center);
                this.desktopFarmMap.addLayer(label);
                this.desktopFarmMapLayers.push(label);

                if (!bounds) {
                    bounds = layer.getBounds();
                } else {
                    bounds.extend(layer.getBounds());
                }
            });

            if (bounds) {
                this.desktopFarmMap.fitBounds(bounds, { padding: [50, 50] });
            }

            // Invalidate size after a short delay to ensure container is visible
            setTimeout(() => {
                if (this.desktopFarmMap) {
                    this.desktopFarmMap.invalidateSize();
                }
            }, 100);

        } catch (e) {
            console.error('Error loading desktop farm map:', e);
            // On error, show background + subtitle
            menuScreen.classList.remove('has-farm-map');
            mapContainer.classList.remove('active');
        }
    },

    destroyDesktopFarmMap() {
        if (this.desktopFarmMap) {
            this.desktopFarmMap.remove();
            this.desktopFarmMap = null;
        }
        this.desktopFarmMapLayers = [];

        const menuScreen = document.getElementById('menu-screen');
        const mapContainer = document.getElementById('desktop-farm-map');
        if (menuScreen) menuScreen.classList.remove('has-farm-map');
        if (mapContainer) mapContainer.classList.remove('active');
    },

    setupSidebar() {
        // Sidebar nav items with data-sidebar-screen
        document.querySelectorAll('[data-sidebar-screen]').forEach(btn => {
            btn.addEventListener('click', () => {
                this.showScreen(btn.dataset.sidebarScreen);
            });
        });

        // Special sidebar buttons
        const sidebarLoadPrior = document.getElementById('sidebar-load-prior');
        if (sidebarLoadPrior) {
            sidebarLoadPrior.addEventListener('click', () => this.showScreen('load-screen'));
        }

        const sidebarPastRecords = document.getElementById('sidebar-past-records');
        if (sidebarPastRecords) {
            sidebarPastRecords.addEventListener('click', () => this.showScreen('past-records-screen'));
        }

        const sidebarFarmProfile = document.getElementById('sidebar-farm-profile');
        if (sidebarFarmProfile) {
            sidebarFarmProfile.addEventListener('click', () => this.showScreen('farm-profile-screen'));
        }

        const sidebarAdmin = document.getElementById('sidebar-admin-panel');
        if (sidebarAdmin) {
            sidebarAdmin.addEventListener('click', () => {
                if (typeof AdminPanel !== 'undefined') AdminPanel.loadDashboard();
                this.showScreen('admin-dashboard-screen');
            });
        }

        const sidebarLogout = document.getElementById('sidebar-logout-btn');
        if (sidebarLogout) {
            sidebarLogout.addEventListener('click', async () => {
                if (confirm('Are you sure you want to logout?')) {
                    const authHandler = window.FirebaseAuth || Auth;
                    await authHandler.logout();
                    this.showScreen('login-screen');
                }
            });
        }
    }
};

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    App.init();
});
