// Field drawing/editing with Leaflet.draw

const FieldEditor = {
    map: null,
    drawnItems: null,
    drawControl: null,
    existingLayers: null,
    mode: 'draw', // 'draw', 'edit', 'view'
    editingField: null,
    adminFarmId: null,

    init() {
        if (this.map) {
            this.map.remove();
            this.map = null;
        }

        this.map = L.map('field-editor-map', {
            center: [43.0, -89.4],
            zoom: 15,
            zoomControl: true
        });

        L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
            attribution: 'ESRI',
            maxZoom: 19
        }).addTo(this.map);

        this.drawnItems = new L.FeatureGroup();
        this.map.addLayer(this.drawnItems);

        this.existingLayers = new L.FeatureGroup();
        this.map.addLayer(this.existingLayers);

        // Load existing farm fields for display
        this.loadExistingFields();

        if (this.mode === 'view') {
            this.hideFieldPanel();
            return;
        }

        // Add draw controls
        if (typeof L.Control.Draw !== 'undefined') {
            this.drawControl = new L.Control.Draw({
                position: 'topright',
                draw: {
                    polygon: {
                        allowIntersection: false,
                        shapeOptions: { color: '#FFFF00', weight: 3, fillOpacity: 0.15 }
                    },
                    polyline: false,
                    circle: false,
                    rectangle: false,
                    marker: false,
                    circlemarker: false
                },
                edit: {
                    featureGroup: this.drawnItems,
                    remove: true
                }
            });
            this.map.addControl(this.drawControl);
        }

        // Handle draw events
        this.map.on(L.Draw.Event.CREATED, (e) => {
            this.drawnItems.clearLayers();
            this.drawnItems.addLayer(e.layer);
            this.showFieldPanel();
        });

        // If editing existing field, load its polygon
        if (this.mode === 'edit' && this.editingField) {
            this.loadEditingField();
        }
    },

    async loadExistingFields() {
        const farmId = this.adminFarmId || (FarmProfile.currentFarm ? FarmProfile.currentFarm.id : null);
        if (!farmId) return;
        try {
            const fields = await FirebaseFarm.getFarmFields(farmId);
            fields.forEach(field => {
                if (!field.geojson) return;
                // Skip the field being edited
                if (this.editingField && field.id === this.editingField.id) return;

                L.geoJSON(field.geojson, {
                    style: {
                        color: '#FFFF00',
                        weight: 3,
                        fillColor: '#FFFF00',
                        fillOpacity: 0.15
                    },
                    onEachFeature: (feature, layer) => {
                        const label = `${field.name || ''}\n${field.fieldType || ''}\n${field.acres ? field.acres + ' ac' : ''}`.trim();
                        if (label) {
                            layer.bindTooltip(label, {
                                permanent: true,
                                direction: 'center',
                                className: 'field-label-tooltip'
                            });
                        }
                    }
                }).addTo(this.existingLayers);
            });

            // Fit bounds to all fields
            const allLayers = new L.FeatureGroup([this.existingLayers, this.drawnItems]);
            if (allLayers.getLayers().length > 0) {
                try { this.map.fitBounds(allLayers.getBounds().pad(0.1)); } catch (e) {}
            }
        } catch (e) {
            console.error('Error loading existing fields:', e);
        }
    },

    loadEditingField() {
        if (!this.editingField || !this.editingField.geojson) return;

        const layer = L.geoJSON(this.editingField.geojson, {
            style: { color: '#FFFF00', weight: 3, fillColor: '#FFFF00', fillOpacity: 0.15 }
        });

        layer.eachLayer(l => this.drawnItems.addLayer(l));

        // Populate form
        document.getElementById('field-edit-name').value = this.editingField.name || '';
        document.getElementById('field-edit-type').value = this.editingField.fieldType || '';
        document.getElementById('field-edit-acres').value = this.editingField.acres || '';

        this.showFieldPanel();

        try { this.map.fitBounds(this.drawnItems.getBounds().pad(0.2)); } catch (e) {}
    },

    showFieldPanel() {
        const panel = document.getElementById('field-edit-panel');
        if (panel) panel.classList.remove('hidden');
    },

    hideFieldPanel() {
        const panel = document.getElementById('field-edit-panel');
        if (panel) panel.classList.add('hidden');
    },

    async saveField() {
        const farmId = this.adminFarmId || (FarmProfile.currentFarm ? FarmProfile.currentFarm.id : null);
        if (!farmId) return;
        const name = document.getElementById('field-edit-name').value.trim();
        const fieldType = document.getElementById('field-edit-type').value;
        const acres = document.getElementById('field-edit-acres').value;

        if (!name) { alert('Field name is required.'); return; }

        // Get GeoJSON from drawn layers
        const geojson = this.drawnItems.toGeoJSON();
        if (!geojson.features || geojson.features.length === 0) {
            alert('Please draw a field boundary on the map.');
            return;
        }

        const user = FirebaseAuth.getCurrentUser();
        const fieldData = {
            name: name,
            fieldType: fieldType,
            acres: acres ? parseFloat(acres) : null,
            uploadedBy: user.uid,
            geojson: geojson,
            metadata: { source: 'drawn' }
        };

        try {
            if (this.mode === 'edit' && this.editingField) {
                await FirebaseFarm.updateFarmField(farmId, this.editingField.id, fieldData);
            } else {
                await FirebaseFarm.saveFarmField(farmId, fieldData);
            }
            // Go back to appropriate screen
            if (this.adminFarmId) {
                this.adminFarmId = null;
                App.showScreen('farmer-detail-screen');
                if (AdminPanel.currentFarmerFarmId) {
                    AdminPanel.loadFarmerFarmFields(AdminPanel.currentFarmerFarmId);
                }
            } else {
                App.showScreen('farm-profile-screen');
            }
        } catch (e) {
            alert('Failed to save field: ' + e.message);
        }
    },

    cleanup() {
        if (this.map) {
            this.map.remove();
            this.map = null;
        }
        this.drawnItems = null;
        this.drawControl = null;
        this.existingLayers = null;
        this.adminFarmId = null;
    }
};
