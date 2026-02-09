// Admin panel logic

const AdminPanel = {
    currentFarmerId: null,
    currentFarmerFarmId: null,
    farmerEquipment: [],
    farmerStorages: [],
    farmerFarmFields: [],
    farmerMembers: [],
    currentFarmId: null,
    allFarms: [],
    activityLogPage: 0,
    searchTimeout: null,

    init() {
        this.setupAdminButton();
        this.setupAdminDashboard();
        this.setupFarmerList();
        this.setupFarmerDetail();
        this.setupFeatureToggles();
        this.setupCreateFarmer();
        this.setupFarmList();
        this.setupFarmDetail();
        this.setupAnalytics();
        this.setupActivityLog();
        this.setupSystemStatus();
        this.setupAnnouncements();
        this.setupAppSettings();
        this.setupBulkInvite();
        this.setupGlobalSearch();
    },

    setupAdminButton() {
        const btn = document.getElementById('admin-panel-btn');
        if (btn) {
            btn.addEventListener('click', () => {
                this.loadDashboard();
                App.showScreen('admin-dashboard-screen');
            });
        }
    },

    // Dashboard
    async loadDashboard() {
        try {
            const [users, farms] = await Promise.all([
                FirebaseAdmin.getAllUsers(),
                FirebaseAdmin.getAllFarms()
            ]);
            const farmers = users.filter(u => u.role !== 'admin' && u.role !== 'superadmin');
            const admins = users.filter(u => u.role === 'admin' || u.role === 'superadmin');

            document.getElementById('stat-total-farmers').textContent = farmers.length;
            document.getElementById('stat-total-farms').textContent = farms.length;
            document.getElementById('stat-total-admins').textContent = admins.length;
        } catch (e) {
            console.error('Failed to load dashboard:', e);
        }
    },

    setupAdminDashboard() {
        const manageFarmersBtn = document.getElementById('admin-manage-farmers');
        const manageFarmsBtn = document.getElementById('admin-manage-farms');
        const featureTogglesBtn = document.getElementById('admin-feature-toggles');
        const analyticsBtn = document.getElementById('admin-analytics-btn');
        const activityLogBtn = document.getElementById('admin-activity-log-btn');
        const announcementsBtn = document.getElementById('admin-announcements-btn');
        const systemStatusBtn = document.getElementById('admin-system-status-btn');
        const appSettingsBtn = document.getElementById('admin-app-settings-btn');
        const bulkInviteBtn = document.getElementById('admin-bulk-invite-btn');

        if (manageFarmersBtn) {
            manageFarmersBtn.addEventListener('click', () => {
                this.loadFarmerList();
                App.showScreen('farmer-list-screen');
            });
        }
        if (manageFarmsBtn) {
            manageFarmsBtn.addEventListener('click', () => {
                this.loadFarmList();
                App.showScreen('farm-list-screen');
            });
        }
        if (featureTogglesBtn) {
            featureTogglesBtn.addEventListener('click', () => {
                this.loadFeatureToggles();
                App.showScreen('feature-toggles-screen');
            });
        }
        if (analyticsBtn) {
            analyticsBtn.addEventListener('click', () => {
                this.loadAnalytics();
                App.showScreen('admin-analytics-screen');
            });
        }
        if (activityLogBtn) {
            activityLogBtn.addEventListener('click', () => {
                this.activityLogPage = 0;
                this.loadActivityLog();
                App.showScreen('admin-activity-log-screen');
            });
        }
        if (announcementsBtn) {
            announcementsBtn.addEventListener('click', () => {
                this.loadAnnouncementsList();
                App.showScreen('admin-announcements-screen');
            });
        }
        if (systemStatusBtn) {
            systemStatusBtn.addEventListener('click', () => {
                this.loadSystemStatus();
                App.showScreen('admin-system-status-screen');
            });
        }
        if (appSettingsBtn) {
            appSettingsBtn.addEventListener('click', () => {
                this.loadAppSettings();
                App.showScreen('admin-settings-screen');
            });
        }
        if (bulkInviteBtn) {
            bulkInviteBtn.addEventListener('click', () => {
                this.showBulkInviteModal();
            });
        }

        // Desktop card click handlers
        this.setupDesktopCards();
    },

    setupDesktopCards() {
        const cardActions = {
            'admin-card-farmers': () => { this.loadFarmerList(); App.showScreen('farmer-list-screen'); },
            'admin-card-farms': () => { this.loadFarmList(); App.showScreen('farm-list-screen'); },
            'admin-card-analytics': () => { this.loadAnalytics(); App.showScreen('admin-analytics-screen'); },
            'admin-card-activity': () => { this.activityLogPage = 0; this.loadActivityLog(); App.showScreen('admin-activity-log-screen'); },
            'admin-card-announcements': () => { this.loadAnnouncementsList(); App.showScreen('admin-announcements-screen'); },
            'admin-card-status': () => { this.loadSystemStatus(); App.showScreen('admin-system-status-screen'); },
            'admin-card-settings': () => { this.loadAppSettings(); App.showScreen('admin-settings-screen'); },
            'admin-card-toggles': () => { this.loadFeatureToggles(); App.showScreen('feature-toggles-screen'); },
            'admin-card-bulk-invite': () => { this.showBulkInviteModal(); }
        };

        Object.entries(cardActions).forEach(([cardId, action]) => {
            const card = document.getElementById(cardId);
            if (card) {
                card.addEventListener('click', action);
            }
        });
    },

    // Farmer List
    async loadFarmerList() {
        const container = document.getElementById('farmer-list-container');
        if (!container) return;
        container.innerHTML = '<p style="padding:16px;color:#666;">Loading...</p>';

        try {
            const users = await FirebaseAdmin.getAllUsers();
            if (users.length === 0) {
                container.innerHTML = '<p style="padding:16px;color:#666;">No users found.</p>';
                return;
            }

            // Fetch farm names for all users that have farmId
            const farmNames = {};
            for (const user of users) {
                if (user.farmId) {
                    try {
                        const farm = await FirebaseFarm.getFarm(user.farmId);
                        if (farm) farmNames[user.uid] = farm.name;
                    } catch (e) { /* ignore */ }
                }
            }

            let html = '';
            users.forEach(user => {
                const roleBadge = user.role === 'superadmin' ? '<span class="role-badge superadmin">Super Admin</span>' :
                                  user.role === 'admin' ? '<span class="role-badge admin">Admin</span>' : '';
                const featureBadge = user.features && user.features.fieldShapefiles ? '<span class="feature-badge">Shapefiles</span>' : '';
                const farmBadge = farmNames[user.uid] ? `<span class="admin-farm-badge">${farmNames[user.uid]}</span>` : '';

                // Status badge
                const status = user.accountStatus || 'active';
                const statusBadge = status !== 'active' ?
                    `<span class="user-status-badge ${status}">${status}</span>` : '';

                // Last login
                let lastLoginStr = '';
                if (user.lastLoginAt) {
                    const lastLogin = new Date(user.lastLoginAt);
                    const now = new Date();
                    const diffDays = Math.floor((now - lastLogin) / (1000 * 60 * 60 * 24));
                    if (diffDays === 0) {
                        lastLoginStr = 'Today';
                    } else if (diffDays === 1) {
                        lastLoginStr = 'Yesterday';
                    } else if (diffDays < 7) {
                        lastLoginStr = `${diffDays} days ago`;
                    } else {
                        lastLoginStr = lastLogin.toLocaleDateString();
                    }
                }

                html += `
                    <div class="farmer-item" data-user-id="${user.uid}">
                        <div class="farmer-name">${user.name || 'Unnamed'} ${roleBadge} ${statusBadge} ${farmBadge}</div>
                        <div class="farmer-email">${user.email} ${featureBadge}</div>
                        ${lastLoginStr ? `<div class="farmer-last-login">Last login: ${lastLoginStr}</div>` : ''}
                    </div>`;
            });
            container.innerHTML = html;

            container.querySelectorAll('.farmer-item').forEach(item => {
                item.addEventListener('click', () => {
                    this.openFarmerDetail(item.dataset.userId);
                });
            });
        } catch (e) {
            container.innerHTML = '<p style="padding:16px;color:#666;">Error loading users.</p>';
            console.error(e);
        }
    },

    setupFarmerList() {
        const searchInput = document.getElementById('farmer-search');
        if (searchInput) {
            searchInput.addEventListener('input', () => {
                const query = searchInput.value.toLowerCase();
                document.querySelectorAll('.farmer-item').forEach(item => {
                    const text = item.textContent.toLowerCase();
                    item.style.display = text.includes(query) ? '' : 'none';
                });
            });
        }
    },

    // Create Farmer
    setupCreateFarmer() {
        const btn = document.getElementById('create-farmer-btn');
        const modal = document.getElementById('create-farmer-modal');
        const cancelBtn = document.getElementById('create-farmer-cancel');
        const form = document.getElementById('create-farmer-form');

        if (btn) btn.addEventListener('click', () => modal && modal.classList.remove('hidden'));
        if (cancelBtn) cancelBtn.addEventListener('click', () => modal && modal.classList.add('hidden'));

        if (form) {
            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                const email = document.getElementById('new-farmer-email').value;
                const name = document.getElementById('new-farmer-name').value;
                const password = document.getElementById('new-farmer-password').value;
                const errorEl = document.getElementById('create-farmer-error');

                try {
                    errorEl.classList.add('hidden');
                    await FirebaseAdmin.createFarmerAccount(email, password, name);
                    modal.classList.add('hidden');
                    form.reset();
                    this.loadFarmerList();
                    alert('Farmer account created successfully.');
                } catch (err) {
                    errorEl.textContent = err.message;
                    errorEl.classList.remove('hidden');
                }
            });
        }
    },

    // Farmer Detail
    async openFarmerDetail(userId) {
        this.currentFarmerId = userId;
        this.currentFarmerFarmId = null;
        App.showScreen('farmer-detail-screen');

        try {
            const userDoc = await FirebaseAdmin.getUserDoc(userId);
            if (!userDoc) {
                alert('User not found.');
                return;
            }

            document.getElementById('farmer-detail-name').textContent = userDoc.name || 'Unnamed';
            document.getElementById('farmer-detail-email').textContent = userDoc.email || '';
            document.getElementById('farmer-detail-role').textContent = userDoc.role || 'farmer';

            // Feature toggle
            const toggle = document.getElementById('farmer-shapefiles-toggle');
            if (toggle) toggle.checked = !!(userDoc.features && userDoc.features.fieldShapefiles);

            // Account status
            const statusSelect = document.getElementById('farmer-status-select');
            if (statusSelect) statusSelect.value = userDoc.accountStatus || 'active';

            // Admin role controls (only superadmin can see)
            const adminControls = document.getElementById('admin-role-controls');
            const currentUser = FirebaseAuth.getCurrentUser();
            const currentUserDoc = currentUser ? await FirebaseAdmin.getUserDoc(currentUser.uid) : null;
            const isSuperAdmin = currentUserDoc && currentUserDoc.role === 'superadmin';

            if (adminControls) {
                adminControls.classList.toggle('hidden', !isSuperAdmin || userDoc.role === 'superadmin');
            }

            const roleToggle = document.getElementById('farmer-admin-toggle');
            if (roleToggle) roleToggle.checked = userDoc.role === 'admin';

            // Load farm info and all sub-sections
            await this.loadFarmerFarmInfo(userId);
        } catch (e) {
            console.error('Failed to load farmer detail:', e);
        }
    },

    // --- Farm Info ---
    async loadFarmerFarmInfo(userId) {
        const farmNameEl = document.getElementById('farmer-farm-name');
        const assignBtn = document.getElementById('assign-farm-btn');
        const transferBtn = document.getElementById('transfer-ownership-btn');

        try {
            const userDoc = await FirebaseAdmin.getUserDoc(userId);
            const farmId = userDoc ? userDoc.farmId : null;

            if (farmId) {
                const farm = await FirebaseFarm.getFarm(farmId);
                if (farm) {
                    this.currentFarmerFarmId = farmId;
                    if (farmNameEl) farmNameEl.textContent = farm.name || 'Unnamed Farm';
                    if (assignBtn) assignBtn.textContent = 'Change Farm';
                    if (transferBtn) transferBtn.style.display = '';

                    // Load all farm sub-sections
                    await Promise.all([
                        this.loadFarmerEquipment(farmId),
                        this.loadFarmerStorages(farmId),
                        this.loadFarmerFarmFields(farmId),
                        this.loadFarmerMembers(farmId)
                    ]);
                    return;
                }
            }

            // No farm
            this.currentFarmerFarmId = null;
            if (farmNameEl) farmNameEl.textContent = 'No farm assigned';
            if (assignBtn) assignBtn.textContent = 'Assign to Farm';
            if (transferBtn) transferBtn.style.display = 'none';

            // Clear sub-sections
            this.renderFarmerEquipment([]);
            this.renderFarmerStorages([]);
            this.renderFarmerFarmFields([]);
            this.renderFarmerMembers([]);
        } catch (e) {
            console.error('Error loading farmer farm info:', e);
        }
    },

    // --- Equipment CRUD ---
    async loadFarmerEquipment(farmId) {
        try {
            this.farmerEquipment = await FirebaseFarm.getEquipment(farmId);
            this.renderFarmerEquipment(this.farmerEquipment);
        } catch (e) {
            console.error('Error loading farmer equipment:', e);
        }
    },

    renderFarmerEquipment(equipment) {
        const container = document.getElementById('admin-equipment-list');
        if (!container) return;

        if (!equipment || equipment.length === 0) {
            container.innerHTML = '<p style="padding:12px;color:#666;">No equipment added yet.</p>';
            return;
        }

        container.innerHTML = equipment.map(eq => `
            <div class="field-item" data-equip-id="${eq.id}">
                <div>
                    <div class="field-name">${eq.name}</div>
                    <div class="field-meta">${eq.type} • ${eq.capacity} ${eq.units}</div>
                </div>
                <div style="display:flex;gap:6px;">
                    <button class="btn-edit-admin-equip" data-equip-id="${eq.id}" style="background:#5c6bc0;color:#fff;border:none;border-radius:6px;padding:6px 12px;font-size:0.8rem;cursor:pointer;">Edit</button>
                    <button class="btn-delete-admin-equip" data-equip-id="${eq.id}" class="btn-delete-field">Delete</button>
                </div>
            </div>
        `).join('');

        container.querySelectorAll('.btn-edit-admin-equip').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const eq = this.farmerEquipment.find(x => x.id === btn.dataset.equipId);
                if (eq) this.showAdminEquipmentForm(eq);
            });
        });

        container.querySelectorAll('.btn-delete-admin-equip').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                if (!this.currentFarmerFarmId) return;
                if (!confirm('Delete this equipment?')) return;
                try {
                    await FirebaseFarm.deleteEquipment(this.currentFarmerFarmId, btn.dataset.equipId);
                    await this.loadFarmerEquipment(this.currentFarmerFarmId);
                } catch (err) {
                    alert('Failed to delete: ' + err.message);
                }
            });
        });
    },

    showAdminEquipmentForm(existing) {
        const formContainer = document.getElementById('admin-equipment-form-container');
        if (formContainer) formContainer.classList.remove('hidden');

        const form = document.getElementById('admin-equipment-form');
        if (!form) return;

        form.dataset.editId = existing ? existing.id : '';
        document.getElementById('admin-equip-name').value = existing ? existing.name : '';
        document.getElementById('admin-equip-type').value = existing ? existing.type : 'Tank';
        document.getElementById('admin-equip-capacity').value = existing ? existing.capacity : '';
        document.getElementById('admin-equip-units').value = existing ? existing.units : 'Gallons';
    },

    async saveFarmerEquipment() {
        if (!this.currentFarmerFarmId) return;
        const form = document.getElementById('admin-equipment-form');
        const editId = form.dataset.editId;

        const data = {
            name: document.getElementById('admin-equip-name').value.trim(),
            type: document.getElementById('admin-equip-type').value,
            capacity: parseFloat(document.getElementById('admin-equip-capacity').value) || 0,
            units: document.getElementById('admin-equip-units').value
        };

        if (!data.name) { alert('Name is required.'); return; }

        try {
            if (editId) {
                await FirebaseFarm.updateEquipment(this.currentFarmerFarmId, editId, data);
            } else {
                await FirebaseFarm.saveEquipment(this.currentFarmerFarmId, data);
            }
            document.getElementById('admin-equipment-form-container').classList.add('hidden');
            await this.loadFarmerEquipment(this.currentFarmerFarmId);
        } catch (e) {
            alert('Failed to save equipment: ' + e.message);
        }
    },

    // --- Storages CRUD ---
    async loadFarmerStorages(farmId) {
        try {
            this.farmerStorages = await FirebaseFarm.getStorages(farmId);
            this.renderFarmerStorages(this.farmerStorages);
        } catch (e) {
            console.error('Error loading farmer storages:', e);
        }
    },

    renderFarmerStorages(storages) {
        const container = document.getElementById('admin-storage-list');
        if (!container) return;

        if (!storages || storages.length === 0) {
            container.innerHTML = '<p style="padding:12px;color:#666;">No manure storages added yet.</p>';
            return;
        }

        container.innerHTML = storages.map(s => `
            <div class="field-item" data-storage-id="${s.id}">
                <div>
                    <div class="field-name">${s.name}</div>
                    <div class="field-meta">${s.source || ''} • ${s.capacity} ${s.units}</div>
                </div>
                <div style="display:flex;gap:6px;">
                    <button class="btn-edit-admin-storage" data-storage-id="${s.id}" style="background:#5c6bc0;color:#fff;border:none;border-radius:6px;padding:6px 12px;font-size:0.8rem;cursor:pointer;">Edit</button>
                    <button class="btn-delete-admin-storage" data-storage-id="${s.id}" style="background:var(--danger-red);color:#fff;border:none;border-radius:6px;padding:6px 12px;font-size:0.8rem;cursor:pointer;">Delete</button>
                </div>
            </div>
        `).join('');

        container.querySelectorAll('.btn-edit-admin-storage').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const s = this.farmerStorages.find(x => x.id === btn.dataset.storageId);
                if (s) this.showAdminStorageForm(s);
            });
        });

        container.querySelectorAll('.btn-delete-admin-storage').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                if (!this.currentFarmerFarmId) return;
                if (!confirm('Delete this storage?')) return;
                try {
                    await FirebaseFarm.deleteStorage(this.currentFarmerFarmId, btn.dataset.storageId);
                    await this.loadFarmerStorages(this.currentFarmerFarmId);
                } catch (err) {
                    alert('Failed to delete: ' + err.message);
                }
            });
        });
    },

    showAdminStorageForm(existing) {
        const formContainer = document.getElementById('admin-storage-form-container');
        if (formContainer) formContainer.classList.remove('hidden');

        const form = document.getElementById('admin-storage-form');
        if (!form) return;

        form.dataset.editId = existing ? existing.id : '';
        document.getElementById('admin-storage-name').value = existing ? existing.name : '';
        document.getElementById('admin-storage-capacity').value = existing ? existing.capacity : '';
        document.getElementById('admin-storage-units').value = existing ? existing.units : 'Gallons';
        document.getElementById('admin-storage-source').value = existing ? existing.source : '';
    },

    async saveFarmerStorage() {
        if (!this.currentFarmerFarmId) return;
        const form = document.getElementById('admin-storage-form');
        const editId = form.dataset.editId;

        const data = {
            name: document.getElementById('admin-storage-name').value.trim(),
            capacity: parseFloat(document.getElementById('admin-storage-capacity').value) || 0,
            units: document.getElementById('admin-storage-units').value,
            source: document.getElementById('admin-storage-source').value
        };

        if (!data.name) { alert('Storage name is required.'); return; }

        try {
            if (editId) {
                await FirebaseFarm.updateStorage(this.currentFarmerFarmId, editId, data);
            } else {
                await FirebaseFarm.saveStorage(this.currentFarmerFarmId, data);
            }
            document.getElementById('admin-storage-form-container').classList.add('hidden');
            await this.loadFarmerStorages(this.currentFarmerFarmId);
        } catch (e) {
            alert('Failed to save storage: ' + e.message);
        }
    },

    // --- Farm Fields ---
    async loadFarmerFarmFields(farmId) {
        try {
            this.farmerFarmFields = await FirebaseFarm.getFarmFields(farmId);
            this.renderFarmerFarmFields(this.farmerFarmFields);
        } catch (e) {
            console.error('Error loading farmer farm fields:', e);
        }
    },

    renderFarmerFarmFields(fields) {
        const container = document.getElementById('admin-farm-fields-list');
        if (!container) return;

        if (!fields || fields.length === 0) {
            container.innerHTML = '<p style="padding:12px;color:#666;">No fields defined yet.</p>';
            return;
        }

        container.innerHTML = fields.map(f => `
            <div class="field-item" data-field-id="${f.id}">
                <div>
                    <div class="field-name">${f.name || 'Unnamed Field'}</div>
                    <div class="field-meta">${f.fieldType || ''} ${f.acres ? '• ' + f.acres + ' ac' : ''}</div>
                </div>
                <div style="display:flex;gap:6px;">
                    <button class="btn-edit-admin-field" data-field-id="${f.id}" style="background:#5c6bc0;color:#fff;border:none;border-radius:6px;padding:6px 12px;font-size:0.8rem;cursor:pointer;">Edit</button>
                    <button class="btn-delete-admin-field" data-field-id="${f.id}" style="background:var(--danger-red);color:#fff;border:none;border-radius:6px;padding:6px 12px;font-size:0.8rem;cursor:pointer;">Delete</button>
                </div>
            </div>
        `).join('');

        container.querySelectorAll('.btn-edit-admin-field').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const field = this.farmerFarmFields.find(f => f.id === btn.dataset.fieldId);
                if (field && this.currentFarmerFarmId) {
                    FieldEditor.mode = 'edit';
                    FieldEditor.editingField = field;
                    FieldEditor.adminFarmId = this.currentFarmerFarmId;
                    App.showScreen('field-map-screen');
                }
            });
        });

        container.querySelectorAll('.btn-delete-admin-field').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                if (!this.currentFarmerFarmId) return;
                if (!confirm('Delete this field?')) return;
                try {
                    await FirebaseFarm.deleteFarmField(this.currentFarmerFarmId, btn.dataset.fieldId);
                    await this.loadFarmerFarmFields(this.currentFarmerFarmId);
                } catch (err) {
                    alert('Failed to delete field: ' + err.message);
                }
            });
        });
    },

    handleFarmerFieldUpload(e) {
        const file = e.target.files[0];
        if (!file || !this.currentFarmerFarmId) return;

        const farmId = this.currentFarmerFarmId;
        const uploadBtn = document.getElementById('admin-upload-shapefile-btn');

        (async () => {
            try {
                if (uploadBtn) { uploadBtn.disabled = true; uploadBtn.textContent = 'Parsing...'; }
                const geojson = await ShapefileHandler.parseFile(file);
                const user = FirebaseAuth.getCurrentUser();

                const features = geojson.features || [];
                if (features.length === 0) {
                    alert('No features found in file.');
                    return;
                }

                for (let i = 0; i < features.length; i++) {
                    const feat = features[i];
                    const props = feat.properties || {};
                    const name = props.Name || props.name || props.NAME || file.name.replace(/\.[^.]+$/, '') + (features.length > 1 ? ` (${i + 1})` : '');
                    const acres = props.Acres || props.acres || props.ACRES || '';
                    const fieldType = props.Type || props.type || props.TYPE || props.fieldType || '';

                    const singleGeoJSON = { type: 'FeatureCollection', features: [feat] };
                    await FirebaseFarm.saveFarmField(farmId, {
                        name: name,
                        fieldType: fieldType,
                        acres: acres,
                        uploadedBy: user.uid,
                        geojson: singleGeoJSON,
                        metadata: { originalFile: file.name, featureCount: 1 }
                    });
                }

                e.target.value = '';
                await this.loadFarmerFarmFields(farmId);
                alert(`${features.length} field(s) imported successfully.`);
            } catch (err) {
                alert('Failed to parse file: ' + err.message);
            } finally {
                if (uploadBtn) { uploadBtn.disabled = false; uploadBtn.textContent = 'Upload Shapefile / GeoJSON'; }
            }
        })();
    },

    // --- Members ---
    async loadFarmerMembers(farmId) {
        try {
            this.farmerMembers = await FirebaseFarm.getMembers(farmId);
            this.renderFarmerMembers(this.farmerMembers);
        } catch (e) {
            console.error('Error loading farmer members:', e);
        }
    },

    renderFarmerMembers(members) {
        const container = document.getElementById('admin-members-list');
        if (!container) return;

        if (!members || members.length === 0) {
            container.innerHTML = '<p style="padding:12px;color:#666;">No members.</p>';
            return;
        }

        container.innerHTML = members.map(m => `
            <div class="field-item">
                <div>
                    <div class="field-name">${m.name || m.email}</div>
                    <div class="field-meta">${m.email}</div>
                </div>
                <div style="display:flex;gap:6px;align-items:center;">
                    <span class="role-badge" style="background:${m.role === 'owner' ? '#2d5a27' : '#5c6bc0'};color:#fff;">${m.role}</span>
                    ${m.role !== 'owner' ? `<button class="btn-remove-member" data-user-id="${m.userId}" style="background:var(--danger-red);color:#fff;border:none;border-radius:6px;padding:6px 12px;font-size:0.8rem;cursor:pointer;">Remove</button>` : ''}
                </div>
            </div>
        `).join('');

        container.querySelectorAll('.btn-remove-member').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                if (!this.currentFarmerFarmId) return;
                if (!confirm('Remove this member from the farm?')) return;
                try {
                    await FirebaseAdmin.removeUserFromFarm(btn.dataset.userId, this.currentFarmerFarmId);
                    await this.loadFarmerMembers(this.currentFarmerFarmId);
                } catch (err) {
                    alert('Failed to remove member: ' + err.message);
                }
            });
        });
    },

    // --- Assign Farm Modal ---
    async showAssignFarmModal() {
        const modal = document.getElementById('assign-farm-modal');
        const select = document.getElementById('assign-farm-select');
        if (!modal || !select) return;

        select.innerHTML = '<option value="">Loading...</option>';
        modal.classList.remove('hidden');

        try {
            const farms = await FirebaseAdmin.getAllFarms();
            let opts = '<option value="">Select a farm...</option>';
            farms.forEach(f => {
                opts += `<option value="${f.id}">${f.name || 'Unnamed Farm'}</option>`;
            });
            opts += '<option value="__new__">+ Create New Farm</option>';
            select.innerHTML = opts;
        } catch (e) {
            select.innerHTML = '<option value="">Error loading farms</option>';
        }
    },

    async assignFarm(userId, farmId) {
        try {
            if (farmId === '__new__') {
                const name = document.getElementById('new-farm-name-input').value.trim();
                if (!name) { alert('Farm name is required.'); return; }
                farmId = await FirebaseFarm.createFarm(name, userId);
                await FirebaseFarm.addMember(farmId, {
                    userId: userId,
                    email: (await FirebaseAdmin.getUserDoc(userId)).email,
                    name: (await FirebaseAdmin.getUserDoc(userId)).name || '',
                    role: 'owner'
                });
            } else {
                await FirebaseAdmin.assignUserToFarm(userId, farmId);
            }

            document.getElementById('assign-farm-modal').classList.add('hidden');
            await this.loadFarmerFarmInfo(userId);
        } catch (e) {
            alert('Failed to assign farm: ' + e.message);
        }
    },

    // --- Transfer Ownership Modal ---
    async showTransferOwnershipModal() {
        const modal = document.getElementById('transfer-ownership-modal');
        const select = document.getElementById('transfer-owner-select');
        if (!modal || !select || !this.currentFarmerFarmId) return;

        select.innerHTML = '<option value="">Loading...</option>';
        modal.classList.remove('hidden');

        try {
            const members = await FirebaseFarm.getMembers(this.currentFarmerFarmId);
            let opts = '<option value="">Select new owner...</option>';
            members.filter(m => m.role !== 'owner').forEach(m => {
                opts += `<option value="${m.userId}">${m.name || m.email}</option>`;
            });
            select.innerHTML = opts;
        } catch (e) {
            select.innerHTML = '<option value="">Error loading members</option>';
        }
    },

    async transferOwnership(farmId, newOwnerId) {
        try {
            await FirebaseAdmin.transferFarmOwnership(farmId, this.currentFarmerId, newOwnerId);
            document.getElementById('transfer-ownership-modal').classList.add('hidden');
            await this.loadFarmerMembers(farmId);
            alert('Ownership transferred successfully.');
        } catch (e) {
            alert('Failed to transfer ownership: ' + e.message);
        }
    },

    // --- View Field Map ---
    viewFarmerFieldMap() {
        if (!this.currentFarmerFarmId) {
            alert('This farmer has no farm assigned.');
            return;
        }
        FieldEditor.mode = 'view';
        FieldEditor.adminFarmId = this.currentFarmerFarmId;
        App.showScreen('field-map-screen');
    },

    // --- View Past Records ---
    viewFarmerRecords() {
        if (!this.currentFarmerFarmId) {
            alert('This farmer has no farm assigned.');
            return;
        }
        PastRecords.adminFarmId = this.currentFarmerFarmId;
        PastRecords.adminUserId = this.currentFarmerId;
        PastRecords.cleanup();
        App.showScreen('past-records-screen');
    },

    // --- Legacy field loading (still used for old shapefile-input) ---
    async loadFarmerFields(userId) {
        const container = document.getElementById('farmer-fields-list');
        if (!container) return;

        try {
            const fields = await FirebaseAdmin.getUserFields(userId);
            if (fields.length === 0) {
                container.innerHTML = '';
                return;
            }

            let html = '';
            fields.forEach(field => {
                const date = new Date(field.uploadedAt).toLocaleDateString();
                const featureCount = field.geojson ? field.geojson.features.length : 0;
                html += `
                    <div class="field-item">
                        <div class="field-info">
                            <div class="field-name">${field.name}</div>
                            <div class="field-meta">${featureCount} feature(s) - Uploaded ${date}</div>
                        </div>
                        <button class="btn-delete-field" data-field-id="${field.id}">Delete</button>
                    </div>`;
            });
            container.innerHTML = html;

            container.querySelectorAll('.btn-delete-field').forEach(btn => {
                btn.addEventListener('click', async () => {
                    if (confirm('Delete this field?')) {
                        await FirebaseAdmin.deleteField(userId, btn.dataset.fieldId);
                        this.loadFarmerFields(userId);
                    }
                });
            });
        } catch (e) {
            container.innerHTML = '';
        }
    },

    setupFarmerDetail() {
        // Feature toggle
        const toggle = document.getElementById('farmer-shapefiles-toggle');
        if (toggle) {
            toggle.addEventListener('change', async () => {
                if (!this.currentFarmerId) return;
                await FirebaseAdmin.updateUserFeatures(this.currentFarmerId, { fieldShapefiles: toggle.checked });
            });
        }

        // Admin role toggle
        const roleToggle = document.getElementById('farmer-admin-toggle');
        if (roleToggle) {
            roleToggle.addEventListener('change', async () => {
                if (!this.currentFarmerId) return;
                const newRole = roleToggle.checked ? 'admin' : 'farmer';
                await FirebaseAdmin.updateUserRole(this.currentFarmerId, newRole);
                document.getElementById('farmer-detail-role').textContent = newRole;
            });
        }

        // Account status dropdown
        const statusSelect = document.getElementById('farmer-status-select');
        if (statusSelect) {
            statusSelect.addEventListener('change', async () => {
                if (!this.currentFarmerId) return;
                const newStatus = statusSelect.value;
                try {
                    await FirebaseAdmin.updateUserStatus(this.currentFarmerId, newStatus);
                } catch (e) {
                    alert('Failed to update status: ' + e.message);
                }
            });
        }

        // Assign Farm button
        const assignFarmBtn = document.getElementById('assign-farm-btn');
        if (assignFarmBtn) {
            assignFarmBtn.addEventListener('click', () => this.showAssignFarmModal());
        }

        // Assign Farm modal events
        const assignFarmSelect = document.getElementById('assign-farm-select');
        if (assignFarmSelect) {
            assignFarmSelect.addEventListener('change', () => {
                const newFarmGroup = document.getElementById('new-farm-name-group');
                if (newFarmGroup) {
                    newFarmGroup.classList.toggle('hidden', assignFarmSelect.value !== '__new__');
                }
            });
        }
        const assignFarmConfirm = document.getElementById('assign-farm-confirm');
        if (assignFarmConfirm) {
            assignFarmConfirm.addEventListener('click', () => {
                const val = document.getElementById('assign-farm-select').value;
                if (!val) { alert('Please select a farm.'); return; }
                this.assignFarm(this.currentFarmerId, val);
            });
        }
        const assignFarmCancel = document.getElementById('assign-farm-cancel');
        if (assignFarmCancel) {
            assignFarmCancel.addEventListener('click', () => {
                document.getElementById('assign-farm-modal').classList.add('hidden');
            });
        }

        // Transfer Ownership button
        const transferBtn = document.getElementById('transfer-ownership-btn');
        if (transferBtn) {
            transferBtn.addEventListener('click', () => this.showTransferOwnershipModal());
        }
        const transferConfirm = document.getElementById('transfer-ownership-confirm');
        if (transferConfirm) {
            transferConfirm.addEventListener('click', () => {
                const newOwnerId = document.getElementById('transfer-owner-select').value;
                if (!newOwnerId) { alert('Please select a new owner.'); return; }
                if (!confirm('Are you sure you want to transfer ownership?')) return;
                this.transferOwnership(this.currentFarmerFarmId, newOwnerId);
            });
        }
        const transferCancel = document.getElementById('transfer-ownership-cancel');
        if (transferCancel) {
            transferCancel.addEventListener('click', () => {
                document.getElementById('transfer-ownership-modal').classList.add('hidden');
            });
        }

        // View Field Map button
        const viewMapBtn = document.getElementById('admin-view-field-map-btn');
        if (viewMapBtn) {
            viewMapBtn.addEventListener('click', () => this.viewFarmerFieldMap());
        }

        // View Past Records button
        const viewRecordsBtn = document.getElementById('admin-view-records-btn');
        if (viewRecordsBtn) {
            viewRecordsBtn.addEventListener('click', () => this.viewFarmerRecords());
        }

        // Admin Equipment form
        const adminAddEquipBtn = document.getElementById('admin-add-equipment-btn');
        if (adminAddEquipBtn) {
            adminAddEquipBtn.addEventListener('click', () => this.showAdminEquipmentForm());
        }
        const adminEquipForm = document.getElementById('admin-equipment-form');
        if (adminEquipForm) {
            adminEquipForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.saveFarmerEquipment();
            });
        }
        const adminEquipCancel = document.getElementById('admin-equipment-cancel');
        if (adminEquipCancel) {
            adminEquipCancel.addEventListener('click', () => {
                document.getElementById('admin-equipment-form-container').classList.add('hidden');
            });
        }

        // Admin Storage form
        const adminAddStorageBtn = document.getElementById('admin-add-storage-btn');
        if (adminAddStorageBtn) {
            adminAddStorageBtn.addEventListener('click', () => this.showAdminStorageForm());
        }
        const adminStorageForm = document.getElementById('admin-storage-form');
        if (adminStorageForm) {
            adminStorageForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.saveFarmerStorage();
            });
        }
        const adminStorageCancel = document.getElementById('admin-storage-cancel');
        if (adminStorageCancel) {
            adminStorageCancel.addEventListener('click', () => {
                document.getElementById('admin-storage-form-container').classList.add('hidden');
            });
        }

        // Admin Field upload
        const adminUploadBtn = document.getElementById('admin-upload-shapefile-btn');
        const adminFileInput = document.getElementById('admin-farm-shapefile-input');
        if (adminUploadBtn && adminFileInput) {
            adminUploadBtn.addEventListener('click', () => adminFileInput.click());
            adminFileInput.addEventListener('change', (e) => this.handleFarmerFieldUpload(e));
        }

        // Admin Draw field
        const adminDrawBtn = document.getElementById('admin-draw-field-btn');
        if (adminDrawBtn) {
            adminDrawBtn.addEventListener('click', () => {
                if (!this.currentFarmerFarmId) { alert('No farm assigned.'); return; }
                FieldEditor.mode = 'draw';
                FieldEditor.editingField = null;
                FieldEditor.adminFarmId = this.currentFarmerFarmId;
                App.showScreen('field-map-screen');
            });
        }
    },

    // Feature Toggles (global)
    async loadFeatureToggles() {
        try {
            const config = await FirebaseAdmin.getGlobalFeatures();
            const toggle = document.getElementById('global-shapefiles-toggle');
            if (toggle) toggle.checked = !!(config && config.fieldShapefiles && config.fieldShapefiles.enabled);
        } catch (e) {
            console.error('Failed to load feature toggles:', e);
        }
    },

    setupFeatureToggles() {
        const toggle = document.getElementById('global-shapefiles-toggle');
        if (toggle) {
            toggle.addEventListener('change', async () => {
                await FirebaseAdmin.updateGlobalFeatures({ fieldShapefiles: { enabled: toggle.checked } });
            });
        }
    },

    // ==================== FARM MANAGEMENT ====================

    async loadFarmList() {
        const container = document.getElementById('farm-list-container');
        if (!container) return;
        container.innerHTML = '<p style="padding:16px;color:#666;">Loading...</p>';

        try {
            const farms = await FirebaseAdmin.getAllFarms();
            this.allFarms = farms;

            if (farms.length === 0) {
                container.innerHTML = '<p style="padding:16px;color:#666;">No farms found.</p>';
                return;
            }

            // Get member counts for each farm
            const farmData = await Promise.all(farms.map(async (farm) => {
                try {
                    const members = await FirebaseFarm.getMembers(farm.id);
                    const fields = await FirebaseFarm.getFarmFields(farm.id);
                    return { ...farm, memberCount: members.length, fieldCount: fields.length };
                } catch (e) {
                    return { ...farm, memberCount: 0, fieldCount: 0 };
                }
            }));

            let html = '';
            farmData.forEach(farm => {
                html += `
                    <div class="farmer-item" data-farm-id="${farm.id}">
                        <div class="farmer-name">${farm.name || 'Unnamed Farm'}</div>
                        <div class="farmer-email">${farm.memberCount} member(s) • ${farm.fieldCount} field(s)</div>
                    </div>`;
            });
            container.innerHTML = html;

            container.querySelectorAll('.farmer-item').forEach(item => {
                item.addEventListener('click', () => {
                    this.openFarmDetail(item.dataset.farmId);
                });
            });
        } catch (e) {
            container.innerHTML = '<p style="padding:16px;color:#666;">Error loading farms.</p>';
            console.error(e);
        }
    },

    setupFarmList() {
        const searchInput = document.getElementById('farm-search');
        if (searchInput) {
            searchInput.addEventListener('input', () => {
                const query = searchInput.value.toLowerCase();
                document.querySelectorAll('#farm-list-container .farmer-item').forEach(item => {
                    const text = item.textContent.toLowerCase();
                    item.style.display = text.includes(query) ? '' : 'none';
                });
            });
        }
    },

    async openFarmDetail(farmId) {
        this.currentFarmId = farmId;
        App.showScreen('farm-detail-screen');

        try {
            const farm = await FirebaseFarm.getFarm(farmId);
            if (!farm) {
                alert('Farm not found.');
                return;
            }

            document.getElementById('farm-detail-name').textContent = farm.name || 'Unnamed Farm';
            document.getElementById('farm-detail-created').textContent = farm.createdAt ? new Date(farm.createdAt).toLocaleDateString() : '-';

            // Load farm features (geofencing toggle)
            const features = await FirebaseFarm.getFarmFeatures(farmId);
            const geofencingToggle = document.getElementById('farm-detail-geofencing-toggle');
            if (geofencingToggle) {
                geofencingToggle.checked = !!(features && features.storageGeofencing);
            }

            // Load all farm data in parallel
            await Promise.all([
                this.loadFarmDetailMembers(farmId),
                this.loadFarmDetailFields(farmId),
                this.loadFarmDetailEquipment(farmId),
                this.loadFarmDetailStorages(farmId)
            ]);
        } catch (e) {
            console.error('Failed to load farm detail:', e);
        }
    },

    async loadFarmDetailMembers(farmId) {
        const container = document.getElementById('farm-detail-members-list');
        if (!container) return;

        try {
            const members = await FirebaseFarm.getMembers(farmId);

            if (!members || members.length === 0) {
                container.innerHTML = '<p style="padding:12px;color:#666;">No members.</p>';
                return;
            }

            container.innerHTML = members.map(m => `
                <div class="field-item" data-user-id="${m.userId}">
                    <div>
                        <div class="field-name">${m.name || m.email}</div>
                        <div class="field-meta">${m.email}</div>
                    </div>
                    <span class="role-badge" style="background:${m.role === 'owner' ? '#2d5a27' : '#5c6bc0'};color:#fff;">${m.role}</span>
                </div>
            `).join('');

            // Click to view farmer detail
            container.querySelectorAll('.field-item').forEach(item => {
                item.addEventListener('click', () => {
                    this.openFarmerDetail(item.dataset.userId);
                });
            });
        } catch (e) {
            container.innerHTML = '<p style="padding:12px;color:#666;">Error loading members.</p>';
        }
    },

    async loadFarmDetailFields(farmId) {
        const container = document.getElementById('farm-detail-fields-list');
        if (!container) return;

        try {
            const fields = await FirebaseFarm.getFarmFields(farmId);

            if (!fields || fields.length === 0) {
                container.innerHTML = '<p style="padding:12px;color:#666;">No fields defined.</p>';
                return;
            }

            container.innerHTML = fields.map(f => `
                <div class="field-item">
                    <div>
                        <div class="field-name">${f.name || 'Unnamed Field'}</div>
                        <div class="field-meta">${f.fieldType || ''} ${f.acres ? '• ' + f.acres + ' ac' : ''}</div>
                    </div>
                </div>
            `).join('');
        } catch (e) {
            container.innerHTML = '<p style="padding:12px;color:#666;">Error loading fields.</p>';
        }
    },

    async loadFarmDetailEquipment(farmId) {
        const container = document.getElementById('farm-detail-equipment-list');
        if (!container) return;

        try {
            const equipment = await FirebaseFarm.getEquipment(farmId);

            if (!equipment || equipment.length === 0) {
                container.innerHTML = '<p style="padding:12px;color:#666;">No equipment.</p>';
                return;
            }

            container.innerHTML = equipment.map(eq => `
                <div class="field-item">
                    <div>
                        <div class="field-name">${eq.name}</div>
                        <div class="field-meta">${eq.type} • ${eq.capacity} ${eq.units}</div>
                    </div>
                </div>
            `).join('');
        } catch (e) {
            container.innerHTML = '<p style="padding:12px;color:#666;">Error loading equipment.</p>';
        }
    },

    async loadFarmDetailStorages(farmId) {
        const container = document.getElementById('farm-detail-storage-list');
        if (!container) return;

        try {
            const storages = await FirebaseFarm.getStorages(farmId);

            if (!storages || storages.length === 0) {
                container.innerHTML = '<p style="padding:12px;color:#666;">No storages.</p>';
                return;
            }

            container.innerHTML = storages.map(s => `
                <div class="field-item">
                    <div>
                        <div class="field-name">${s.name}</div>
                        <div class="field-meta">${s.source || ''} • ${s.capacity} ${s.units}</div>
                    </div>
                </div>
            `).join('');
        } catch (e) {
            container.innerHTML = '<p style="padding:12px;color:#666;">Error loading storages.</p>';
        }
    },

    setupFarmDetail() {
        // Storage Geofencing toggle
        const geofencingToggle = document.getElementById('farm-detail-geofencing-toggle');
        if (geofencingToggle) {
            geofencingToggle.addEventListener('change', async () => {
                if (!this.currentFarmId) return;
                await FirebaseFarm.updateFarmFeatures(this.currentFarmId, {
                    storageGeofencing: geofencingToggle.checked
                });
            });
        }

        // View Fields on Map button
        const viewMapBtn = document.getElementById('farm-detail-view-map-btn');
        if (viewMapBtn) {
            viewMapBtn.addEventListener('click', () => {
                if (!this.currentFarmId) return;
                FieldEditor.mode = 'view';
                FieldEditor.adminFarmId = this.currentFarmId;
                App.showScreen('field-map-screen');
            });
        }

        // View Records button
        const viewRecordsBtn = document.getElementById('farm-detail-view-records-btn');
        if (viewRecordsBtn) {
            viewRecordsBtn.addEventListener('click', () => {
                if (!this.currentFarmId) return;
                PastRecords.adminFarmId = this.currentFarmId;
                PastRecords.adminUserId = null; // Show all users for this farm
                PastRecords.cleanup();
                App.showScreen('past-records-screen');
            });
        }
    },

    // ==================== ANALYTICS ====================

    setupAnalytics() {
        const periodSelect = document.getElementById('analytics-period');
        if (periodSelect) {
            periodSelect.addEventListener('change', () => {
                this.loadAnalytics();
            });
        }
    },

    async loadAnalytics() {
        const periodSelect = document.getElementById('analytics-period');
        const period = periodSelect ? periodSelect.value : 'all';

        // Show loading state
        document.getElementById('analytics-total-records').textContent = '...';
        document.getElementById('analytics-total-acres').textContent = '...';
        document.getElementById('analytics-avg-rate').textContent = '...';
        document.getElementById('analytics-top-farms').innerHTML = '<p class="loading-text">Loading...</p>';
        document.getElementById('analytics-top-users').innerHTML = '<p class="loading-text">Loading...</p>';

        try {
            const stats = await FirebaseAdmin.getSpreadingStats(period);

            document.getElementById('analytics-total-records').textContent = stats.totalRecords.toLocaleString();
            document.getElementById('analytics-total-acres').textContent = stats.totalAcres.toLocaleString();
            document.getElementById('analytics-avg-rate').textContent = stats.averageRate.toLocaleString();

            // Render top farms
            const topFarmsEl = document.getElementById('analytics-top-farms');
            if (stats.topFarms.length === 0) {
                topFarmsEl.innerHTML = '<p class="no-data">No farm activity yet.</p>';
            } else {
                topFarmsEl.innerHTML = stats.topFarms.map((f, i) => `
                    <div class="analytics-list-item">
                        <span class="rank">#${i + 1}</span>
                        <span class="name">${f.name}</span>
                        <span class="count">${f.count} records</span>
                    </div>
                `).join('');
            }

            // Render top users
            const topUsersEl = document.getElementById('analytics-top-users');
            if (stats.topUsers.length === 0) {
                topUsersEl.innerHTML = '<p class="no-data">No user activity yet.</p>';
            } else {
                topUsersEl.innerHTML = stats.topUsers.map((u, i) => `
                    <div class="analytics-list-item">
                        <span class="rank">#${i + 1}</span>
                        <span class="name">${u.name || u.email}</span>
                        <span class="count">${u.count} records</span>
                    </div>
                `).join('');
            }
        } catch (e) {
            console.error('Failed to load analytics:', e);
            document.getElementById('analytics-total-records').textContent = 'Error';
        }
    },

    // ==================== ACTIVITY LOG ====================

    setupActivityLog() {
        const typeSelect = document.getElementById('activity-log-type');
        const dateInput = document.getElementById('activity-log-date');
        const loadMoreBtn = document.getElementById('activity-log-load-more');

        if (typeSelect) {
            typeSelect.addEventListener('change', () => {
                this.activityLogPage = 0;
                this.loadActivityLog();
            });
        }
        if (dateInput) {
            dateInput.addEventListener('change', () => {
                this.activityLogPage = 0;
                this.loadActivityLog();
            });
        }
        if (loadMoreBtn) {
            loadMoreBtn.addEventListener('click', () => {
                this.activityLogPage++;
                this.loadActivityLog(true);
            });
        }
    },

    async loadActivityLog(append = false) {
        const container = document.getElementById('activity-log-list');
        const loadMoreBtn = document.getElementById('activity-log-load-more');
        const typeSelect = document.getElementById('activity-log-type');
        const dateInput = document.getElementById('activity-log-date');

        if (!append) {
            container.innerHTML = '<p class="loading-text">Loading...</p>';
        }

        try {
            const options = {
                pageSize: 50,
                eventType: typeSelect?.value || null
            };

            if (dateInput?.value) {
                options.startDate = dateInput.value + 'T00:00:00.000Z';
                options.endDate = dateInput.value + 'T23:59:59.999Z';
            }

            const logs = await FirebaseAdmin.getActivityLogs(options);

            if (!append) {
                container.innerHTML = '';
            }

            if (logs.length === 0 && !append) {
                container.innerHTML = '<p class="no-data">No activity logs found.</p>';
                loadMoreBtn.style.display = 'none';
                return;
            }

            logs.forEach(log => {
                const date = new Date(log.timestamp);
                const dateStr = date.toLocaleDateString();
                const timeStr = date.toLocaleTimeString();
                const icon = this.getActivityIcon(log.eventType);

                const div = document.createElement('div');
                div.className = 'activity-log-item';
                div.innerHTML = `
                    <div class="activity-icon">${icon}</div>
                    <div class="activity-content">
                        <div class="activity-type">${this.formatEventType(log.eventType)}</div>
                        <div class="activity-user">${log.userEmail || 'Unknown'}</div>
                        <div class="activity-details">${this.formatActivityDetails(log)}</div>
                    </div>
                    <div class="activity-time">${dateStr}<br>${timeStr}</div>
                `;
                container.appendChild(div);
            });

            // Show/hide load more button
            loadMoreBtn.style.display = logs.length >= 50 ? 'block' : 'none';

        } catch (e) {
            console.error('Failed to load activity log:', e);
            container.innerHTML = '<p class="error-text">Failed to load activity log.</p>';
        }
    },

    getActivityIcon(eventType) {
        const icons = {
            'login': '🔑',
            'registration': '👤',
            'spreading_start': '🚜',
            'spreading_end': '✅',
            'export': '📤',
            'user_status_change': '🔄',
            'announcement_create': '📢',
            'announcement_update': '📝',
            'announcement_delete': '🗑️',
            'settings_update': '⚙️',
            'bulk_invite': '📧'
        };
        return icons[eventType] || '📋';
    },

    formatEventType(eventType) {
        const labels = {
            'login': 'User Login',
            'registration': 'New Registration',
            'spreading_start': 'Spreading Started',
            'spreading_end': 'Spreading Ended',
            'export': 'Data Export',
            'user_status_change': 'User Status Changed',
            'announcement_create': 'Announcement Created',
            'announcement_update': 'Announcement Updated',
            'announcement_delete': 'Announcement Deleted',
            'settings_update': 'Settings Updated',
            'bulk_invite': 'Bulk Invite Sent'
        };
        return labels[eventType] || eventType;
    },

    formatActivityDetails(log) {
        const details = log.details || {};
        if (log.eventType === 'spreading_end') {
            return `${details.pointCount || 0} points, ${(details.duration || 0).toFixed(1)} min`;
        }
        if (log.eventType === 'export') {
            return `${details.format || 'unknown'} format, ${details.logCount || 0} logs`;
        }
        if (log.eventType === 'user_status_change') {
            return `Changed to: ${details.newStatus || 'unknown'}`;
        }
        if (log.eventType === 'bulk_invite') {
            return `${details.count || 0} invites sent`;
        }
        return '';
    },

    // ==================== SYSTEM STATUS ====================

    setupSystemStatus() {
        const clearCacheBtn = document.getElementById('clear-cache-btn');
        if (clearCacheBtn) {
            clearCacheBtn.addEventListener('click', async () => {
                if (confirm('This will clear the app cache and reload. Continue?')) {
                    try {
                        if ('caches' in window) {
                            const cacheNames = await caches.keys();
                            await Promise.all(cacheNames.map(name => caches.delete(name)));
                        }
                        if (navigator.serviceWorker && navigator.serviceWorker.controller) {
                            navigator.serviceWorker.controller.postMessage({ type: 'SKIP_WAITING' });
                        }
                        window.location.reload(true);
                    } catch (e) {
                        alert('Failed to clear cache: ' + e.message);
                    }
                }
            });
        }
    },

    async loadSystemStatus() {
        // Show loading state
        document.getElementById('status-user-count').textContent = '...';
        document.getElementById('status-farm-count').textContent = '...';
        document.getElementById('status-field-count').textContent = '...';
        document.getElementById('status-record-count').textContent = '...';

        try {
            const stats = await FirebaseAdmin.getSystemStats();

            document.getElementById('status-user-count').textContent = stats.userCount.toLocaleString();
            document.getElementById('status-farm-count').textContent = stats.farmCount.toLocaleString();
            document.getElementById('status-field-count').textContent = stats.fieldCount.toLocaleString();
            document.getElementById('status-record-count').textContent = stats.recordCount.toLocaleString();

            // Check service worker status
            const swStatusEl = document.getElementById('sw-status');
            const swVersionEl = document.getElementById('sw-cache-version');

            if ('serviceWorker' in navigator) {
                const reg = await navigator.serviceWorker.getRegistration();
                if (reg && reg.active) {
                    swStatusEl.textContent = 'Active';
                    swStatusEl.style.color = 'var(--success-green)';
                } else if (reg && reg.installing) {
                    swStatusEl.textContent = 'Installing';
                    swStatusEl.style.color = '#f57c00';
                } else {
                    swStatusEl.textContent = 'Not Active';
                    swStatusEl.style.color = 'var(--danger-red)';
                }
            } else {
                swStatusEl.textContent = 'Not Supported';
                swStatusEl.style.color = '#666';
            }

            // Try to get cache version from SW file
            try {
                const swResponse = await fetch('/sw.js');
                const swText = await swResponse.text();
                const match = swText.match(/CACHE_NAME\s*=\s*['"]([^'"]+)['"]/);
                if (match) {
                    swVersionEl.textContent = match[1];
                } else {
                    swVersionEl.textContent = 'Unknown';
                }
            } catch (e) {
                swVersionEl.textContent = 'Unknown';
            }

        } catch (e) {
            console.error('Failed to load system status:', e);
            document.getElementById('status-user-count').textContent = 'Error';
        }
    },

    // ==================== ANNOUNCEMENTS ====================

    setupAnnouncements() {
        const createBtn = document.getElementById('create-announcement-btn');
        const form = document.getElementById('announcement-form');
        const cancelBtn = document.getElementById('announcement-cancel');

        if (createBtn) {
            createBtn.addEventListener('click', () => {
                this.showAnnouncementModal();
            });
        }

        if (form) {
            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                await this.saveAnnouncement();
            });
        }

        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => {
                document.getElementById('create-announcement-modal').classList.add('hidden');
            });
        }
    },

    showAnnouncementModal(announcement = null) {
        const modal = document.getElementById('create-announcement-modal');
        const title = document.getElementById('announcement-modal-title');
        const editId = document.getElementById('announcement-edit-id');
        const titleInput = document.getElementById('announcement-title');
        const messageInput = document.getElementById('announcement-message');
        const typeSelect = document.getElementById('announcement-type');
        const expiresInput = document.getElementById('announcement-expires');
        const dismissibleToggle = document.getElementById('announcement-dismissible');

        if (announcement) {
            title.textContent = 'Edit Announcement';
            editId.value = announcement.id;
            titleInput.value = announcement.title || '';
            messageInput.value = announcement.message || '';
            typeSelect.value = announcement.type || 'info';
            expiresInput.value = announcement.expiresAt ? announcement.expiresAt.split('T')[0] : '';
            dismissibleToggle.checked = announcement.dismissible !== false;
        } else {
            title.textContent = 'Create Announcement';
            editId.value = '';
            titleInput.value = '';
            messageInput.value = '';
            typeSelect.value = 'info';
            expiresInput.value = '';
            dismissibleToggle.checked = true;
        }

        modal.classList.remove('hidden');
    },

    async saveAnnouncement() {
        const editId = document.getElementById('announcement-edit-id').value;
        const data = {
            title: document.getElementById('announcement-title').value.trim(),
            message: document.getElementById('announcement-message').value.trim(),
            type: document.getElementById('announcement-type').value,
            expiresAt: document.getElementById('announcement-expires').value ?
                document.getElementById('announcement-expires').value + 'T23:59:59.999Z' : null,
            dismissible: document.getElementById('announcement-dismissible').checked
        };

        if (!data.title || !data.message) {
            alert('Title and message are required.');
            return;
        }

        try {
            if (editId) {
                await FirebaseAdmin.updateAnnouncement(editId, data);
            } else {
                await FirebaseAdmin.createAnnouncement(data);
            }
            document.getElementById('create-announcement-modal').classList.add('hidden');
            this.loadAnnouncementsList();
        } catch (e) {
            alert('Failed to save announcement: ' + e.message);
        }
    },

    async loadAnnouncementsList() {
        const container = document.getElementById('announcements-list');
        container.innerHTML = '<p class="loading-text">Loading...</p>';

        try {
            const announcements = await FirebaseAdmin.getAllAnnouncements();

            if (announcements.length === 0) {
                container.innerHTML = '<p class="no-data">No announcements yet.</p>';
                return;
            }

            container.innerHTML = announcements.map(a => {
                const typeClass = `announcement-type-${a.type || 'info'}`;
                const statusBadge = a.active ?
                    '<span class="status-badge active">Active</span>' :
                    '<span class="status-badge inactive">Inactive</span>';
                const date = new Date(a.createdAt).toLocaleDateString();

                return `
                    <div class="announcement-item ${typeClass}">
                        <div class="announcement-header">
                            <h4>${a.title}</h4>
                            ${statusBadge}
                        </div>
                        <p class="announcement-message">${a.message}</p>
                        <div class="announcement-meta">
                            <span class="announcement-type-badge">${a.type || 'info'}</span>
                            <span>Created: ${date}</span>
                            ${a.expiresAt ? `<span>Expires: ${new Date(a.expiresAt).toLocaleDateString()}</span>` : ''}
                        </div>
                        <div class="announcement-actions">
                            <button class="btn btn-small" onclick="AdminPanel.showAnnouncementModal(${JSON.stringify(a).replace(/"/g, '&quot;')})">Edit</button>
                            <button class="btn btn-small" onclick="AdminPanel.toggleAnnouncement('${a.id}', ${!a.active})">${a.active ? 'Deactivate' : 'Activate'}</button>
                            <button class="btn btn-small btn-danger" onclick="AdminPanel.deleteAnnouncement('${a.id}')">Delete</button>
                        </div>
                    </div>
                `;
            }).join('');
        } catch (e) {
            console.error('Failed to load announcements:', e);
            container.innerHTML = '<p class="error-text">Failed to load announcements.</p>';
        }
    },

    async toggleAnnouncement(announcementId, active) {
        try {
            await FirebaseAdmin.updateAnnouncement(announcementId, { active });
            this.loadAnnouncementsList();
        } catch (e) {
            alert('Failed to update announcement: ' + e.message);
        }
    },

    async deleteAnnouncement(announcementId) {
        if (!confirm('Delete this announcement?')) return;

        try {
            await FirebaseAdmin.deleteAnnouncement(announcementId);
            this.loadAnnouncementsList();
        } catch (e) {
            alert('Failed to delete announcement: ' + e.message);
        }
    },

    // ==================== APP SETTINGS ====================

    setupAppSettings() {
        const form = document.getElementById('app-settings-form');
        if (form) {
            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                await this.saveAppSettings();
            });
        }
    },

    async loadAppSettings() {
        try {
            const settings = await FirebaseAdmin.getAppSettings();

            document.getElementById('setting-spread-width').value = settings.defaultSpreadWidth || 50;
            document.getElementById('setting-rate-units').value = settings.rateUnits || 'gal/ac';
            document.getElementById('setting-spring-month').value = settings.seasonBoundaries?.spring?.month || 3;
            document.getElementById('setting-fall-month').value = settings.seasonBoundaries?.fall?.month || 9;
        } catch (e) {
            console.error('Failed to load app settings:', e);
        }
    },

    async saveAppSettings() {
        const settings = {
            defaultSpreadWidth: parseInt(document.getElementById('setting-spread-width').value) || 50,
            rateUnits: document.getElementById('setting-rate-units').value,
            seasonBoundaries: {
                spring: { month: parseInt(document.getElementById('setting-spring-month').value) || 3 },
                fall: { month: parseInt(document.getElementById('setting-fall-month').value) || 9 }
            }
        };

        try {
            await FirebaseAdmin.updateAppSettings(settings);
            const msgEl = document.getElementById('app-settings-message');
            msgEl.textContent = 'Settings saved successfully!';
            msgEl.classList.remove('hidden');
            setTimeout(() => msgEl.classList.add('hidden'), 3000);
        } catch (e) {
            alert('Failed to save settings: ' + e.message);
        }
    },

    // ==================== BULK INVITE ====================

    setupBulkInvite() {
        const form = document.getElementById('bulk-invite-form');
        const cancelBtn = document.getElementById('bulk-invite-cancel');

        if (form) {
            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                await this.sendBulkInvites();
            });
        }

        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => {
                document.getElementById('bulk-invite-modal').classList.add('hidden');
            });
        }
    },

    async showBulkInviteModal() {
        const modal = document.getElementById('bulk-invite-modal');
        const farmSelect = document.getElementById('bulk-invite-farm');

        // Load farms
        farmSelect.innerHTML = '<option value="">Loading...</option>';
        modal.classList.remove('hidden');

        try {
            const farms = await FirebaseAdmin.getAllFarms();
            farmSelect.innerHTML = '<option value="">Select a farm...</option>' +
                farms.map(f => `<option value="${f.id}">${f.name || 'Unnamed'}</option>`).join('');
        } catch (e) {
            farmSelect.innerHTML = '<option value="">Error loading farms</option>';
        }

        // Reset form
        document.getElementById('bulk-invite-emails').value = '';
        document.getElementById('bulk-invite-role').value = 'member';
        document.getElementById('bulk-invite-progress').classList.add('hidden');
        document.getElementById('bulk-invite-submit').disabled = false;
    },

    async sendBulkInvites() {
        const farmId = document.getElementById('bulk-invite-farm').value;
        const emailsText = document.getElementById('bulk-invite-emails').value;
        const role = document.getElementById('bulk-invite-role').value;

        if (!farmId) {
            alert('Please select a farm.');
            return;
        }

        const emails = emailsText.split('\n').map(e => e.trim()).filter(e => e);
        if (emails.length === 0) {
            alert('Please enter at least one email address.');
            return;
        }

        const progressDiv = document.getElementById('bulk-invite-progress');
        const progressBar = document.getElementById('bulk-invite-progress-bar');
        const statusEl = document.getElementById('bulk-invite-status');
        const submitBtn = document.getElementById('bulk-invite-submit');

        progressDiv.classList.remove('hidden');
        submitBtn.disabled = true;
        progressBar.style.width = '0%';
        statusEl.textContent = 'Sending invites...';

        try {
            const results = await FirebaseAdmin.sendBulkInvites(emails, farmId, role);

            const successCount = results.filter(r => r.success).length;
            const failCount = results.filter(r => !r.success).length;

            progressBar.style.width = '100%';
            statusEl.textContent = `Done! ${successCount} sent, ${failCount} failed.`;

            setTimeout(() => {
                document.getElementById('bulk-invite-modal').classList.add('hidden');
                alert(`Invites sent: ${successCount} successful, ${failCount} failed.`);
            }, 1500);
        } catch (e) {
            statusEl.textContent = 'Error: ' + e.message;
            submitBtn.disabled = false;
        }
    },

    // ==================== GLOBAL SEARCH ====================

    setupGlobalSearch() {
        const searchInput = document.getElementById('admin-global-search');
        const resultsDiv = document.getElementById('admin-search-results');

        if (searchInput) {
            searchInput.addEventListener('input', () => {
                clearTimeout(this.searchTimeout);
                this.searchTimeout = setTimeout(() => {
                    this.handleGlobalSearch(searchInput.value);
                }, 300);
            });

            searchInput.addEventListener('blur', () => {
                // Delay hiding to allow clicking on results
                setTimeout(() => {
                    if (resultsDiv) resultsDiv.classList.add('hidden');
                }, 200);
            });

            searchInput.addEventListener('focus', () => {
                if (searchInput.value.trim() && resultsDiv && resultsDiv.innerHTML.trim()) {
                    resultsDiv.classList.remove('hidden');
                }
            });
        }
    },

    async handleGlobalSearch(query) {
        const resultsDiv = document.getElementById('admin-search-results');
        if (!resultsDiv) return;

        if (!query.trim()) {
            resultsDiv.classList.add('hidden');
            return;
        }

        resultsDiv.innerHTML = '<p class="loading-text">Searching...</p>';
        resultsDiv.classList.remove('hidden');

        try {
            const results = await FirebaseAdmin.globalSearch(query);

            let html = '';

            if (results.users.length > 0) {
                html += '<div class="search-section"><h4>Users</h4>';
                results.users.forEach(u => {
                    html += `<div class="search-result-item" data-type="user" data-id="${u.uid}">
                        <span class="result-icon">👤</span>
                        <span class="result-name">${u.name || u.email}</span>
                    </div>`;
                });
                html += '</div>';
            }

            if (results.farms.length > 0) {
                html += '<div class="search-section"><h4>Farms</h4>';
                results.farms.forEach(f => {
                    html += `<div class="search-result-item" data-type="farm" data-id="${f.id}">
                        <span class="result-icon">🏡</span>
                        <span class="result-name">${f.name}</span>
                    </div>`;
                });
                html += '</div>';
            }

            if (results.fields.length > 0) {
                html += '<div class="search-section"><h4>Fields</h4>';
                results.fields.forEach(f => {
                    html += `<div class="search-result-item" data-type="field" data-farm-id="${f.farmId}">
                        <span class="result-icon">🗺️</span>
                        <span class="result-name">${f.name}</span>
                        <span class="result-sub">${f.farmName || ''}</span>
                    </div>`;
                });
                html += '</div>';
            }

            if (!html) {
                html = '<p class="no-data">No results found.</p>';
            }

            resultsDiv.innerHTML = html;

            // Add click handlers
            resultsDiv.querySelectorAll('.search-result-item').forEach(item => {
                item.addEventListener('mousedown', (e) => {
                    e.preventDefault();
                    const type = item.dataset.type;
                    const id = item.dataset.id;

                    if (type === 'user') {
                        this.openFarmerDetail(id);
                    } else if (type === 'farm') {
                        this.openFarmDetail(id);
                    } else if (type === 'field') {
                        this.openFarmDetail(item.dataset.farmId);
                    }

                    resultsDiv.classList.add('hidden');
                    document.getElementById('admin-global-search').value = '';
                });
            });

        } catch (e) {
            console.error('Global search error:', e);
            resultsDiv.innerHTML = '<p class="error-text">Search failed.</p>';
        }
    }
};
