// Admin panel logic

const AdminPanel = {
    currentFarmerId: null,

    init() {
        this.setupAdminButton();
        this.setupAdminDashboard();
        this.setupFarmerList();
        this.setupFarmerDetail();
        this.setupFeatureToggles();
        this.setupCreateFarmer();
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
            const users = await FirebaseAdmin.getAllUsers();
            const farmers = users.filter(u => u.role !== 'admin' && u.role !== 'superadmin');
            const admins = users.filter(u => u.role === 'admin' || u.role === 'superadmin');
            const withShapefiles = farmers.filter(u => u.features && u.features.fieldShapefiles);

            document.getElementById('stat-total-farmers').textContent = farmers.length;
            document.getElementById('stat-total-admins').textContent = admins.length;
            document.getElementById('stat-shapefiles-enabled').textContent = withShapefiles.length;
        } catch (e) {
            console.error('Failed to load dashboard:', e);
        }
    },

    setupAdminDashboard() {
        const manageFarmersBtn = document.getElementById('admin-manage-farmers');
        const featureTogglesBtn = document.getElementById('admin-feature-toggles');

        if (manageFarmersBtn) {
            manageFarmersBtn.addEventListener('click', () => {
                this.loadFarmerList();
                App.showScreen('farmer-list-screen');
            });
        }
        if (featureTogglesBtn) {
            featureTogglesBtn.addEventListener('click', () => {
                this.loadFeatureToggles();
                App.showScreen('feature-toggles-screen');
            });
        }
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

            let html = '';
            users.forEach(user => {
                const roleBadge = user.role === 'superadmin' ? '<span class="role-badge superadmin">Super Admin</span>' :
                                  user.role === 'admin' ? '<span class="role-badge admin">Admin</span>' : '';
                const featureBadge = user.features && user.features.fieldShapefiles ? '<span class="feature-badge">Shapefiles</span>' : '';
                html += `
                    <div class="farmer-item" data-user-id="${user.uid}">
                        <div class="farmer-name">${user.name || 'Unnamed'} ${roleBadge}</div>
                        <div class="farmer-email">${user.email} ${featureBadge}</div>
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

            // Load fields
            this.loadFarmerFields(userId);
        } catch (e) {
            console.error('Failed to load farmer detail:', e);
        }
    },

    async loadFarmerFields(userId) {
        const container = document.getElementById('farmer-fields-list');
        if (!container) return;

        try {
            const fields = await FirebaseAdmin.getUserFields(userId);
            if (fields.length === 0) {
                container.innerHTML = '<p style="padding:12px;color:#666;">No fields uploaded.</p>';
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
            container.innerHTML = '<p style="padding:12px;color:#666;">Error loading fields.</p>';
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

        // Shapefile upload
        const uploadBtn = document.getElementById('upload-shapefile-btn');
        const fileInput = document.getElementById('shapefile-input');
        if (uploadBtn && fileInput) {
            uploadBtn.addEventListener('click', () => fileInput.click());
            fileInput.addEventListener('change', async () => {
                const file = fileInput.files[0];
                if (!file || !this.currentFarmerId) return;

                try {
                    uploadBtn.disabled = true;
                    uploadBtn.textContent = 'Parsing...';
                    const geojson = await ShapefileHandler.parseFile(file);
                    const fieldName = file.name.replace(/\.(zip|geojson|json)$/i, '');

                    await FirebaseAdmin.saveFieldData(this.currentFarmerId, {
                        name: fieldName,
                        geojson: geojson,
                        metadata: { originalFile: file.name, featureCount: geojson.features.length }
                    });

                    this.loadFarmerFields(this.currentFarmerId);
                    alert('Field uploaded successfully.');
                } catch (err) {
                    alert('Upload failed: ' + err.message);
                } finally {
                    uploadBtn.disabled = false;
                    uploadBtn.textContent = 'Upload Shapefile / GeoJSON';
                    fileInput.value = '';
                }
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
    }
};
