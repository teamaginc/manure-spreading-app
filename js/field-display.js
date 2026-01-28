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

        // Check if feature is enabled for this user
        try {
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
                    color: '#DAA520',
                    weight: 3,
                    fillColor: '#DAA520',
                    fillOpacity: 0.15,
                    dashArray: '5,5'
                },
                onEachFeature: (feature, lyr) => {
                    const props = feature.properties || {};
                    const entries = Object.entries(props).filter(([, v]) => v != null && v !== '');
                    if (entries.length > 0) {
                        const html = entries.map(([k, v]) => `<b>${k}:</b> ${v}`).join('<br>');
                        lyr.bindPopup(`<div style="max-height:200px;overflow:auto"><b>${field.name}</b><br>${html}</div>`);
                    } else {
                        lyr.bindPopup(`<b>${field.name}</b>`);
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
