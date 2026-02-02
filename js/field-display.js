// Field boundary display on Leaflet map

const FieldDisplay = {
    fieldLayers: [],

    async loadFields(userId) {
        if (!window.FirebaseAdmin) return;
        try {
            const fields = await FirebaseAdmin.getUserFields(userId);
            this.displayFields(fields);
        } catch (e) {
            console.error('Failed to load fields:', e);
        }
    },

    async loadCurrentUserFields() {
        const user = window.FirebaseAuth && FirebaseAuth.getCurrentUser();
        if (!user) return;

        try {
            // Try loading from farm fields first
            if (window.FirebaseFarm) {
                const farm = await FirebaseFarm.getFarmByUser(user.uid);
                if (farm) {
                    const fields = await FirebaseFarm.getFarmFields(farm.id);
                    if (fields.length > 0) {
                        this.displayFields(fields);
                        return;
                    }
                }
            }

            // Fallback to user-level fields
            const userDoc = await FirebaseAdmin.getUserDoc(user.uid);
            if (!userDoc || !userDoc.features || !userDoc.features.fieldShapefiles) return;

            const fields = await FirebaseAdmin.getUserFields(user.uid);
            this.displayFields(fields);
        } catch (e) {
            console.error('Failed to load current user fields:', e);
        }
    },

    displayFields(fields) {
        this.clearFields();
        if (!MapManager.map || !fields || fields.length === 0) return;

        fields.forEach(field => {
            if (!field.geojson) return;
            const layer = L.geoJSON(field.geojson, {
                style: {
                    color: '#FFFF00',
                    weight: 3,
                    fillColor: '#FFFF00',
                    fillOpacity: 0.15
                },
                onEachFeature: (feature, lyr) => {
                    // Build label text
                    const parts = [];
                    if (field.name) parts.push(field.name);
                    if (field.fieldType) parts.push(field.fieldType);
                    if (field.acres) parts.push(field.acres + ' ac');

                    const label = parts.join('\n');
                    if (label) {
                        lyr.bindTooltip(label, {
                            permanent: true,
                            direction: 'center',
                            className: 'field-label-tooltip'
                        });
                    }

                    // Also keep popup for click
                    const props = feature.properties || {};
                    const entries = Object.entries(props).filter(([, v]) => v != null && v !== '');
                    if (entries.length > 0) {
                        const html = entries.map(([k, v]) => `<b>${k}:</b> ${v}`).join('<br>');
                        lyr.bindPopup(`<div style="max-height:200px;overflow:auto"><b>${field.name}</b><br>${html}</div>`);
                    } else {
                        lyr.bindPopup(`<b>${field.name || 'Field'}</b>`);
                    }
                }
            }).addTo(MapManager.map);
            this.fieldLayers.push(layer);
        });
    },

    clearFields() {
        this.fieldLayers.forEach(layer => {
            if (MapManager.map) MapManager.map.removeLayer(layer);
        });
        this.fieldLayers = [];
    }
};
