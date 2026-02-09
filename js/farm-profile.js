// Farm Profile management - fields, equipment, collaborators

const FarmProfile = {
    currentFarm: null,
    farmFields: [],
    equipment: [],
    storages: [],
    members: [],
    geofencingEnabled: false,

    async init() {
        this.setupListeners();
    },

    setupListeners() {
        // Farm name save
        const nameInput = document.getElementById('farm-name-input');
        if (nameInput) {
            nameInput.addEventListener('change', () => this.saveFarmName(nameInput.value));
        }

        // Upload shapefile/geojson
        const uploadBtn = document.getElementById('farm-upload-shapefile-btn');
        const fileInput = document.getElementById('farm-shapefile-input');
        if (uploadBtn && fileInput) {
            uploadBtn.addEventListener('click', () => fileInput.click());
            fileInput.addEventListener('change', (e) => this.handleFileUpload(e));
        }

        // Draw new field
        const drawBtn = document.getElementById('farm-draw-field-btn');
        if (drawBtn) {
            drawBtn.addEventListener('click', () => {
                FieldEditor.mode = 'draw';
                FieldEditor.editingField = null;
                App.showScreen('field-map-screen');
            });
        }

        // View all fields on map
        const viewBtn = document.getElementById('farm-view-fields-btn');
        if (viewBtn) {
            viewBtn.addEventListener('click', () => {
                FieldEditor.mode = 'view';
                App.showScreen('field-map-screen');
            });
        }

        // Add equipment
        const addEquipBtn = document.getElementById('add-equipment-btn');
        if (addEquipBtn) {
            addEquipBtn.addEventListener('click', () => this.showEquipmentForm());
        }

        // Equipment form
        const equipForm = document.getElementById('equipment-form');
        if (equipForm) {
            equipForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.saveEquipment();
            });
        }
        const equipCancel = document.getElementById('equipment-cancel');
        if (equipCancel) {
            equipCancel.addEventListener('click', () => this.hideEquipmentForm());
        }

        // Add storage
        const addStorageBtn = document.getElementById('add-storage-btn');
        if (addStorageBtn) {
            addStorageBtn.addEventListener('click', () => this.showStorageForm());
        }

        const storageForm = document.getElementById('storage-form');
        if (storageForm) {
            storageForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.saveStorage();
            });
        }
        const storageCancel = document.getElementById('storage-cancel');
        if (storageCancel) {
            storageCancel.addEventListener('click', () => this.hideStorageForm());
        }

        // Invite collaborator
        const inviteBtn = document.getElementById('invite-collaborator-btn');
        if (inviteBtn) {
            inviteBtn.addEventListener('click', () => this.showInviteModal());
        }

        const inviteForm = document.getElementById('invite-form');
        if (inviteForm) {
            inviteForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.sendInvite();
            });
        }
        const inviteCancel = document.getElementById('invite-cancel');
        if (inviteCancel) {
            inviteCancel.addEventListener('click', () => this.hideInviteModal());
        }

        // Delete farm
        const deleteFarmBtn = document.getElementById('delete-farm-btn');
        if (deleteFarmBtn) {
            deleteFarmBtn.addEventListener('click', () => this.confirmDeleteFarm());
        }
    },

    async load() {
        const user = window.FirebaseAuth && FirebaseAuth.getCurrentUser();
        if (!user) return;

        await this.ensureFarm();

        // Toggle between no-farm and farm views
        const noFarmSection = document.getElementById('farm-no-farm-section');
        const farmContent = document.getElementById('farm-content-sections');
        const dangerZone = document.getElementById('farm-danger-zone');

        if (!this.currentFarm) {
            // Show "no farm" state with create button
            if (noFarmSection) noFarmSection.classList.remove('hidden');
            if (farmContent) farmContent.classList.add('hidden');
            if (dangerZone) dangerZone.classList.add('hidden');
            return;
        }

        if (noFarmSection) noFarmSection.classList.add('hidden');
        if (farmContent) farmContent.classList.remove('hidden');

        // Only show danger zone to farm owner (check both member role and createdBy)
        const members = await FirebaseFarm.getMembers(this.currentFarm.id);
        const currentMember = members.find(m => m.userId === user.uid);
        const isOwner = currentMember?.role === 'owner' || user.uid === this.currentFarm.createdBy;
        if (dangerZone) dangerZone.classList.toggle('hidden', !isOwner);

        // Load farm name
        const nameInput = document.getElementById('farm-name-input');
        if (nameInput) nameInput.value = this.currentFarm.name || '';

        // Check farm features for geofencing (requires global + per-farm enabled)
        try {
            const globalFeatures = await FirebaseAdmin.getGlobalFeatures();
            const globalEnabled = !!(globalFeatures && globalFeatures.storageGeofencing && globalFeatures.storageGeofencing.enabled);

            if (globalEnabled) {
                const farmFeatures = await FirebaseFarm.getFarmFeatures(this.currentFarm.id);
                this.geofencingEnabled = !!(farmFeatures && farmFeatures.storageGeofencing);
            } else {
                this.geofencingEnabled = false;
            }
        } catch (e) {
            this.geofencingEnabled = false;
        }

        await Promise.all([
            this.loadFields(),
            this.loadEquipment(),
            this.loadStorages(),
            this.loadMembers()
        ]);
    },

    async ensureFarm() {
        const user = FirebaseAuth.getCurrentUser();
        if (!user) return;

        try {
            // Check if user already has a farm
            let farm = await FirebaseFarm.getFarmByUser(user.uid);
            if (farm) {
                this.currentFarm = farm;
                return;
            }

            // No farm found - don't auto-create
            this.currentFarm = null;
        } catch (e) {
            console.error('Error checking farm:', e);
        }
    },

    async saveFarmName(name) {
        if (!this.currentFarm) return;
        try {
            await FirebaseFarm.updateFarmName(this.currentFarm.id, name);
            this.currentFarm.name = name;
        } catch (e) {
            console.error('Error saving farm name:', e);
        }
    },

    // --- Fields ---

    async loadFields() {
        if (!this.currentFarm) return;
        try {
            this.farmFields = await FirebaseFarm.getFarmFields(this.currentFarm.id);
            this.renderFieldList();
        } catch (e) {
            console.error('Error loading fields:', e);
        }
    },

    renderFieldList() {
        const container = document.getElementById('farm-fields-list');
        if (!container) return;

        if (this.farmFields.length === 0) {
            container.innerHTML = '<p style="padding:12px;color:#666;">No fields defined yet.</p>';
            return;
        }

        container.innerHTML = this.farmFields.map(f => `
            <div class="field-item" data-field-id="${f.id}">
                <div>
                    <div class="field-name">${f.name || 'Unnamed Field'}</div>
                    <div class="field-meta">${f.fieldType || ''} ${f.acres ? '• ' + f.acres + ' ac' : ''}</div>
                </div>
                <div style="display:flex;gap:6px;">
                    <button class="btn-edit-field" data-field-id="${f.id}" style="background:#5c6bc0;color:#fff;border:none;border-radius:6px;padding:6px 12px;font-size:0.8rem;cursor:pointer;">Edit</button>
                    <button class="btn-delete-field" data-field-id="${f.id}">Delete</button>
                </div>
            </div>
        `).join('');

        // Bind edit buttons
        container.querySelectorAll('.btn-edit-field').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const field = this.farmFields.find(f => f.id === btn.dataset.fieldId);
                if (field) {
                    FieldEditor.mode = 'edit';
                    FieldEditor.editingField = field;
                    App.showScreen('field-map-screen');
                }
            });
        });

        // Bind delete buttons
        container.querySelectorAll('.btn-delete-field').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                if (!confirm('Delete this field?')) return;
                try {
                    await FirebaseFarm.deleteFarmField(this.currentFarm.id, btn.dataset.fieldId);
                    await this.loadFields();
                } catch (err) {
                    alert('Failed to delete field: ' + err.message);
                }
            });
        });
    },

    async handleFileUpload(e) {
        const file = e.target.files[0];
        if (!file || !this.currentFarm) return;

        try {
            const geojson = await ShapefileHandler.parseFile(file);
            const user = FirebaseAuth.getCurrentUser();

            // For each feature, create a field
            const features = geojson.features || [];
            if (features.length === 0) {
                alert('No features found in file.');
                return;
            }

            for (let i = 0; i < features.length; i++) {
                const feat = features[i];
                const props = feat.properties || {};
                const name = props.Name || props.name || props.NAME || file.name.replace(/\.[^.]+$/, '') + (features.length > 1 ? ` (${i + 1})` : '');
                const acres = props.Acres || props.acres || props.ACRES || this.calculateAcres(feat) || '';
                const fieldType = props.Type || props.type || props.TYPE || props.fieldType || '';

                const singleGeoJSON = { type: 'FeatureCollection', features: [feat] };
                await FirebaseFarm.saveFarmField(this.currentFarm.id, {
                    name: name,
                    fieldType: fieldType,
                    acres: acres,
                    uploadedBy: user.uid,
                    geojson: singleGeoJSON,
                    metadata: { originalFile: file.name, featureCount: 1 }
                });
            }

            // Reset input
            e.target.value = '';
            await this.loadFields();
            alert(`${features.length} field(s) imported successfully.`);
        } catch (err) {
            console.error('File upload error:', err);
            alert('Failed to parse file: ' + err.message);
        }
    },

    calculateAcres(feature) {
        // Rough acreage calculation from coordinates using Shoelace formula
        try {
            const coords = this.getCoordinates(feature);
            if (!coords || coords.length < 3) return null;

            // Convert to approximate meters and compute area
            const refLat = coords[0][1];
            const latFactor = 111320; // meters per degree lat
            const lngFactor = 111320 * Math.cos(refLat * Math.PI / 180);

            let area = 0;
            for (let i = 0; i < coords.length; i++) {
                const j = (i + 1) % coords.length;
                const xi = coords[i][0] * lngFactor;
                const yi = coords[i][1] * latFactor;
                const xj = coords[j][0] * lngFactor;
                const yj = coords[j][1] * latFactor;
                area += xi * yj - xj * yi;
            }
            area = Math.abs(area) / 2;
            const acres = area / 4046.86; // sq meters to acres
            return Math.round(acres * 10) / 10;
        } catch (e) {
            return null;
        }
    },

    getCoordinates(feature) {
        const geom = feature.geometry;
        if (!geom) return null;
        if (geom.type === 'Polygon') return geom.coordinates[0];
        if (geom.type === 'MultiPolygon') return geom.coordinates[0][0];
        return null;
    },

    // --- Equipment ---

    async loadEquipment() {
        if (!this.currentFarm) return;
        try {
            this.equipment = await FirebaseFarm.getEquipment(this.currentFarm.id);
            this.renderEquipmentList();
        } catch (e) {
            console.error('Error loading equipment:', e);
        }
    },

    renderEquipmentList() {
        const container = document.getElementById('equipment-list');
        if (!container) return;

        if (this.equipment.length === 0) {
            container.innerHTML = '<p style="padding:12px;color:#666;">No equipment added yet.</p>';
            return;
        }

        container.innerHTML = this.equipment.map(eq => `
            <div class="field-item" data-equip-id="${eq.id}">
                <div>
                    <div class="field-name">${eq.name}</div>
                    <div class="field-meta">${eq.type} • ${eq.capacity} ${eq.units}</div>
                </div>
                <div style="display:flex;gap:6px;">
                    <button class="btn-edit-equip" data-equip-id="${eq.id}" style="background:#5c6bc0;color:#fff;border:none;border-radius:6px;padding:6px 12px;font-size:0.8rem;cursor:pointer;">Edit</button>
                    <button class="btn-delete-field" data-equip-id="${eq.id}">Delete</button>
                </div>
            </div>
        `).join('');

        container.querySelectorAll('.btn-edit-equip').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const eq = this.equipment.find(x => x.id === btn.dataset.equipId);
                if (eq) this.showEquipmentForm(eq);
            });
        });

        container.querySelectorAll('.btn-delete-field').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                if (!confirm('Delete this equipment?')) return;
                try {
                    await FirebaseFarm.deleteEquipment(this.currentFarm.id, btn.dataset.equipId);
                    await this.loadEquipment();
                } catch (err) {
                    alert('Failed to delete: ' + err.message);
                }
            });
        });
    },

    showEquipmentForm(existingEquip) {
        const formContainer = document.getElementById('equipment-form-container');
        if (formContainer) formContainer.classList.remove('hidden');

        const form = document.getElementById('equipment-form');
        if (!form) return;

        form.dataset.editId = existingEquip ? existingEquip.id : '';
        document.getElementById('equip-name').value = existingEquip ? existingEquip.name : '';
        document.getElementById('equip-type').value = existingEquip ? existingEquip.type : 'Tank';
        document.getElementById('equip-capacity').value = existingEquip ? existingEquip.capacity : '';
        document.getElementById('equip-units').value = existingEquip ? existingEquip.units : 'Gallons';
    },

    hideEquipmentForm() {
        const formContainer = document.getElementById('equipment-form-container');
        if (formContainer) formContainer.classList.add('hidden');
    },

    async saveEquipment() {
        if (!this.currentFarm) return;
        const form = document.getElementById('equipment-form');
        const editId = form.dataset.editId;

        const data = {
            name: document.getElementById('equip-name').value.trim(),
            type: document.getElementById('equip-type').value,
            capacity: parseFloat(document.getElementById('equip-capacity').value) || 0,
            units: document.getElementById('equip-units').value
        };

        if (!data.name) { alert('Name is required.'); return; }

        try {
            if (editId) {
                await FirebaseFarm.updateEquipment(this.currentFarm.id, editId, data);
            } else {
                await FirebaseFarm.saveEquipment(this.currentFarm.id, data);
            }
            this.hideEquipmentForm();
            await this.loadEquipment();
        } catch (e) {
            alert('Failed to save equipment: ' + e.message);
        }
    },

    // --- Manure Storages ---

    async loadStorages() {
        if (!this.currentFarm) return;
        try {
            this.storages = await FirebaseFarm.getStorages(this.currentFarm.id);
            this.renderStorageList();
        } catch (e) {
            console.error('Error loading storages:', e);
        }
    },

    renderStorageList() {
        const container = document.getElementById('storage-list');
        if (!container) return;

        if (this.storages.length === 0) {
            container.innerHTML = '<p style="padding:12px;color:#666;">No manure storages added yet.</p>';
            return;
        }

        container.innerHTML = this.storages.map(s => {
            const geofenceBtn = this.geofencingEnabled
                ? `<button class="btn-geofence-storage ${s.hasGeofence ? 'btn-edit-geofence' : 'btn-draw-geofence'}" data-storage-id="${s.id}">${s.hasGeofence ? 'Edit Geofence' : 'Set Geofence'}</button>`
                : '';
            return `
            <div class="field-item" data-storage-id="${s.id}">
                <div>
                    <div class="field-name">${s.name}</div>
                    <div class="field-meta">${s.source || ''} • ${s.capacity} ${s.units}</div>
                </div>
                <div style="display:flex;gap:6px;">
                    ${geofenceBtn}
                    <button class="btn-edit-storage" data-storage-id="${s.id}" style="background:#5c6bc0;color:#fff;border:none;border-radius:6px;padding:6px 12px;font-size:0.8rem;cursor:pointer;">Edit</button>
                    <button class="btn-delete-field" data-storage-id="${s.id}">Delete</button>
                </div>
            </div>
        `}).join('');

        container.querySelectorAll('.btn-edit-storage').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const s = this.storages.find(x => x.id === btn.dataset.storageId);
                if (s) this.showStorageForm(s);
            });
        });

        container.querySelectorAll('.btn-delete-field').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                if (!confirm('Delete this storage?')) return;
                try {
                    await FirebaseFarm.deleteStorage(this.currentFarm.id, btn.dataset.storageId);
                    await this.loadStorages();
                } catch (err) {
                    alert('Failed to delete: ' + err.message);
                }
            });
        });

        // Geofence buttons
        container.querySelectorAll('.btn-geofence-storage').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const storage = this.storages.find(x => x.id === btn.dataset.storageId);
                if (!storage) return;
                StorageGeofenceEditor.init(
                    this.currentFarm.id,
                    storage.id,
                    storage.name,
                    storage.geojson || null
                );
                App.showScreen('storage-geofence-screen');
            });
        });
    },

    showStorageForm(existing) {
        const formContainer = document.getElementById('storage-form-container');
        if (formContainer) formContainer.classList.remove('hidden');

        const form = document.getElementById('storage-form');
        if (!form) return;

        form.dataset.editId = existing ? existing.id : '';
        document.getElementById('storage-name').value = existing ? existing.name : '';
        document.getElementById('storage-capacity').value = existing ? existing.capacity : '';
        document.getElementById('storage-units').value = existing ? existing.units : 'Gallons';
        document.getElementById('storage-source').value = existing ? existing.source : '';
    },

    hideStorageForm() {
        const formContainer = document.getElementById('storage-form-container');
        if (formContainer) formContainer.classList.add('hidden');
    },

    async saveStorage() {
        if (!this.currentFarm) return;
        const form = document.getElementById('storage-form');
        const editId = form.dataset.editId;

        const data = {
            name: document.getElementById('storage-name').value.trim(),
            capacity: parseFloat(document.getElementById('storage-capacity').value) || 0,
            units: document.getElementById('storage-units').value,
            source: document.getElementById('storage-source').value
        };

        if (!data.name) { alert('Storage name is required.'); return; }

        try {
            if (editId) {
                await FirebaseFarm.updateStorage(this.currentFarm.id, editId, data);
            } else {
                await FirebaseFarm.saveStorage(this.currentFarm.id, data);
            }
            this.hideStorageForm();
            await this.loadStorages();
        } catch (e) {
            alert('Failed to save storage: ' + e.message);
        }
    },

    // --- Collaborators ---

    async loadMembers() {
        if (!this.currentFarm) return;
        try {
            this.members = await FirebaseFarm.getMembers(this.currentFarm.id);
            this.renderMemberList();
        } catch (e) {
            console.error('Error loading members:', e);
        }
    },

    renderMemberList() {
        const container = document.getElementById('collaborator-list');
        if (!container) return;

        if (this.members.length === 0) {
            container.innerHTML = '<p style="padding:12px;color:#666;">No members.</p>';
            return;
        }

        container.innerHTML = this.members.map(m => `
            <div class="field-item">
                <div>
                    <div class="field-name">${m.name || m.email}</div>
                    <div class="field-meta">${m.email}</div>
                </div>
                <span class="role-badge" style="background:${m.role === 'owner' ? '#2d5a27' : '#5c6bc0'};color:#fff;">${m.role}</span>
            </div>
        `).join('');
    },

    showInviteModal() {
        const modal = document.getElementById('invite-modal');
        if (modal) modal.classList.remove('hidden');
    },

    hideInviteModal() {
        const modal = document.getElementById('invite-modal');
        if (modal) modal.classList.add('hidden');
        const form = document.getElementById('invite-form');
        if (form) form.reset();
    },

    async sendInvite() {
        if (!this.currentFarm) return;
        const email = document.getElementById('invite-email').value.trim();
        const role = document.getElementById('invite-role').value;
        const user = FirebaseAuth.getCurrentUser();

        if (!email) { alert('Email is required.'); return; }

        try {
            await FirebaseFarm.createInvite({
                farmId: this.currentFarm.id,
                farmName: this.currentFarm.name || 'Farm',
                invitedBy: user.uid,
                invitedEmail: email.toLowerCase(),
                role: role,
                status: 'pending',
                createdAt: new Date().toISOString()
            });
            this.hideInviteModal();
            alert('Invite sent to ' + email);
        } catch (e) {
            alert('Failed to send invite: ' + e.message);
        }
    },

    async createNewFarm() {
        const user = FirebaseAuth.getCurrentUser();
        if (!user) return;

        const userName = user.name || user.email.split('@')[0];
        const farmName = prompt('Enter a name for your farm:', userName + "'s Farm");
        if (!farmName) return;

        try {
            const farmId = await FirebaseFarm.createFarm(farmName, user.uid);
            await FirebaseFarm.addMember(farmId, {
                userId: user.uid,
                email: user.email,
                name: user.name || '',
                role: 'owner'
            });
            this.currentFarm = await FirebaseFarm.getFarm(farmId);
            await this.load();
        } catch (e) {
            console.error('Error creating farm:', e);
            alert('Failed to create farm: ' + e.message);
        }
    },

    async confirmDeleteFarm() {
        if (!this.currentFarm) return;

        const farmName = this.currentFarm.name || 'this farm';
        const confirmed = confirm(
            `Are you sure you want to delete "${farmName}"?\n\n` +
            `This will permanently remove all fields, equipment, storages, and member associations.`
        );
        if (!confirmed) return;

        const user = FirebaseAuth.getCurrentUser();
        if (!user) return;

        // Get user's logs for this farm
        const userLogs = await FirebaseDB.getLogsByFarmId(user.uid, this.currentFarm.id);
        const logCount = userLogs.length;

        // Get user's other farms for transfer option
        const userFarms = await FirebaseAdmin.getFarmsForUser(user.uid);
        const otherFarms = userFarms.filter(f => f.id !== this.currentFarm.id);

        // Show records handling modal
        const modal = document.getElementById('farm-delete-records-modal');
        const countEl = document.getElementById('farm-delete-records-count');
        const transferOption = document.getElementById('farm-delete-transfer-option');
        const transferSelect = document.getElementById('farm-delete-transfer-target');
        const deleteBtn = document.getElementById('farm-delete-records-delete');
        const transferBtn = document.getElementById('farm-delete-records-transfer');
        const cancelBtn = document.getElementById('farm-delete-records-cancel');

        countEl.textContent = `You have ${logCount} spreading record${logCount !== 1 ? 's' : ''} associated with this farm.`;

        // Show transfer option if user has other farms
        if (otherFarms.length > 0) {
            transferOption.classList.remove('hidden');
            transferBtn.classList.remove('hidden');
            transferSelect.innerHTML = '<option value="">Select a farm...</option>' +
                otherFarms.map(f => `<option value="${f.id}" data-name="${f.name}">${f.name}</option>`).join('');
        } else {
            transferOption.classList.add('hidden');
            transferBtn.classList.add('hidden');
        }

        // Update delete button text based on log count
        deleteBtn.textContent = logCount > 0 ? 'Clear Farm from My Records' : 'Continue with Deletion';

        modal.classList.remove('hidden');

        // Store farm reference for handlers
        const farmToDelete = this.currentFarm;

        // Create promise to handle user choice
        return new Promise((resolve) => {
            const cleanup = () => {
                modal.classList.add('hidden');
                deleteBtn.removeEventListener('click', handleDelete);
                transferBtn.removeEventListener('click', handleTransfer);
                cancelBtn.removeEventListener('click', handleCancel);
            };

            const proceedWithDeletion = async () => {
                // Type-to-confirm
                const typedName = prompt(`Type the farm name "${farmName}" to confirm deletion:`);
                if (typedName !== farmName) {
                    alert('Farm name did not match. Deletion cancelled.');
                    return;
                }

                try {
                    await FirebaseFarm.deleteFarm(farmToDelete.id);
                    this.currentFarm = null;
                    alert('Farm deleted successfully.');
                    await this.load();
                } catch (e) {
                    console.error('Error deleting farm:', e);
                    alert('Failed to delete farm: ' + e.message);
                }
            };

            const handleDelete = async () => {
                cleanup();
                // Clear farmId from user's logs (deleteFarm will handle other members)
                if (logCount > 0) {
                    try {
                        await FirebaseDB.clearFarmIdFromLogs(user.uid, farmToDelete.id);
                    } catch (e) {
                        console.error('Error clearing logs:', e);
                    }
                }
                await proceedWithDeletion();
                resolve();
            };

            const handleTransfer = async () => {
                const targetFarmId = transferSelect.value;
                const targetOption = transferSelect.selectedOptions[0];
                const targetFarmName = targetOption?.dataset?.name || '';

                if (!targetFarmId) {
                    alert('Please select a farm to transfer records to.');
                    return;
                }

                cleanup();
                // Transfer logs to new farm
                if (logCount > 0) {
                    try {
                        await FirebaseDB.transferLogsFarmId(user.uid, farmToDelete.id, targetFarmId, targetFarmName);
                    } catch (e) {
                        console.error('Error transferring logs:', e);
                        alert('Failed to transfer records: ' + e.message);
                        return;
                    }
                }
                await proceedWithDeletion();
                resolve();
            };

            const handleCancel = () => {
                cleanup();
                resolve();
            };

            deleteBtn.addEventListener('click', handleDelete);
            transferBtn.addEventListener('click', handleTransfer);
            cancelBtn.addEventListener('click', handleCancel);
        });
    },

    // Check and prompt for pending invites on login
    async checkPendingInvites() {
        const user = window.FirebaseAuth && FirebaseAuth.getCurrentUser();
        if (!user || !window.FirebaseFarm) return;

        try {
            const invites = await FirebaseFarm.getInvitesForEmail(user.email.toLowerCase());
            for (const invite of invites) {
                if (invite.status !== 'pending') continue;
                const accept = confirm(`You've been invited to join "${invite.farmName}" as ${invite.role}. Accept?`);
                if (accept) {
                    await FirebaseFarm.acceptInvite(invite.id, user);
                }
            }
        } catch (e) {
            console.error('Error checking invites:', e);
        }
    }
};
