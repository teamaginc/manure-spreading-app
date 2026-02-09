// Storage geofence drawing/editing with Leaflet.draw
// Follows same pattern as FieldEditor

const StorageGeofenceEditor = {
    map: null,
    drawnItems: null,
    drawControl: null,
    existingLayers: null,
    farmId: null,
    storageId: null,
    storageName: null,
    existingGeojson: null,
    adminFarmId: null,

    init(farmId, storageId, storageName, existingGeojson) {
        this.farmId = farmId;
        this.storageId = storageId;
        this.storageName = storageName;
        this.existingGeojson = existingGeojson || null;

        if (this.map) {
            this.map.remove();
            this.map = null;
        }

        // Update header title
        const title = document.getElementById('storage-geofence-title');
        if (title) title.textContent = storageName || 'Storage Geofence';

        // Show/hide clear button based on existing geofence
        const clearBtn = document.getElementById('storage-geofence-clear-btn');
        if (clearBtn) clearBtn.classList.toggle('hidden', !existingGeojson);

        this.map = L.map('storage-geofence-map', {
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

        // Load farm field boundaries for spatial context
        this.loadFieldBoundaries();

        // Add draw controls - polygon only
        if (typeof L.Control.Draw !== 'undefined') {
            this.drawControl = new L.Control.Draw({
                position: 'topright',
                draw: {
                    polygon: {
                        allowIntersection: false,
                        shapeOptions: { color: '#FF8C00', weight: 3, fillOpacity: 0.2, dashArray: '10, 6' }
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

        // Handle draw events - only allow one polygon
        this.map.on(L.Draw.Event.CREATED, (e) => {
            this.drawnItems.clearLayers();
            this.drawnItems.addLayer(e.layer);
        });

        // If editing existing geofence, load its polygon
        if (this.existingGeojson) {
            this.loadExistingGeofence();
        } else {
            // Center on user GPS position (farmer is likely at the storage when drawing)
            this.centerOnUserPosition();
        }
    },

    async loadFieldBoundaries() {
        if (!this.farmId) return;
        try {
            const fields = await FirebaseFarm.getFarmFields(this.farmId);
            fields.forEach(field => {
                if (!field.geojson) return;
                L.geoJSON(field.geojson, {
                    style: {
                        color: '#FFFF00',
                        weight: 2,
                        fillColor: '#FFFF00',
                        fillOpacity: 0.08
                    },
                    onEachFeature: (feature, layer) => {
                        const label = field.name || '';
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
        } catch (e) {
            console.error('Error loading field boundaries:', e);
        }
    },

    loadExistingGeofence() {
        if (!this.existingGeojson) return;

        const layer = L.geoJSON(this.existingGeojson, {
            style: { color: '#FF8C00', weight: 3, fillColor: '#FF8C00', fillOpacity: 0.2, dashArray: '10, 6' }
        });

        layer.eachLayer(l => this.drawnItems.addLayer(l));

        try { this.map.fitBounds(this.drawnItems.getBounds().pad(0.3)); } catch (e) {}
    },

    centerOnUserPosition() {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    if (this.map) {
                        this.map.setView([pos.coords.latitude, pos.coords.longitude], 17);
                    }
                },
                () => {
                    // Fall back to field bounds if available
                    if (this.existingLayers && this.existingLayers.getLayers().length > 0) {
                        try { this.map.fitBounds(this.existingLayers.getBounds().pad(0.2)); } catch (e) {}
                    }
                },
                { enableHighAccuracy: true, timeout: 5000 }
            );
        }
    },

    async save() {
        if (!this.farmId || !this.storageId) return;

        const geojson = this.drawnItems.toGeoJSON();
        if (!geojson.features || geojson.features.length === 0) {
            alert('Please draw a geofence polygon on the map.');
            return;
        }

        try {
            await FirebaseFarm.updateStorage(this.farmId, this.storageId, {
                geojsonStr: JSON.stringify(geojson),
                hasGeofence: true
            });

            // Navigate back
            this.navigateBack();
        } catch (e) {
            alert('Failed to save geofence: ' + e.message);
        }
    },

    async clearGeofence() {
        if (!this.farmId || !this.storageId) return;
        if (!confirm('Remove the geofence from this storage?')) return;

        try {
            await FirebaseFarm.updateStorage(this.farmId, this.storageId, {
                geojsonStr: null,
                hasGeofence: false
            });

            this.navigateBack();
        } catch (e) {
            alert('Failed to clear geofence: ' + e.message);
        }
    },

    navigateBack() {
        const wasAdmin = !!this.adminFarmId;
        this.cleanup();
        if (wasAdmin) {
            App.showScreen('farmer-detail-screen');
        } else {
            App.showScreen('farm-profile-screen');
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
        this.farmId = null;
        this.storageId = null;
        this.storageName = null;
        this.existingGeojson = null;
        this.adminFarmId = null;
    }
};
