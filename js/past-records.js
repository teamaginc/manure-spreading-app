// Past Records Viewer - View spreading records by field

const PastRecords = {
    map: null,
    isInitialized: false,
    fieldLayers: [],
    allLogs: [],
    allFields: [],
    farmMembers: [],
    selectedField: null,
    adminFarmId: null,  // Set by AdminPanel to scope fields to a specific farm
    adminUserId: null,  // Set by AdminPanel to scope logs to a specific user

    async init() {
        if (this.isInitialized && this.map) {
            this.map.invalidateSize();
            return;
        }

        this.map = L.map('past-records-map', {
            zoomControl: true,
            attributionControl: true
        }).setView([43.0, -89.4], 15);

        L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
            maxZoom: 19,
            attribution: 'Tiles &copy; Esri'
        }).addTo(this.map);

        this.isInitialized = true;

        await this.loadData();
        this.renderFields();
    },

    async loadData() {
        try {
            let farmId = this.adminFarmId;
            let userId = this.adminUserId;

            if (!farmId) {
                const user = window.FirebaseAuth && FirebaseAuth.getCurrentUser();
                if (!user || !window.FirebaseFarm) return;
                const farm = await FirebaseFarm.getFarmByUser(user.uid);
                if (!farm) return;
                farmId = farm.id;
            }

            // Load fields, logs, and members in parallel
            const logsPromise = userId && window.FirebaseAdmin
                ? FirebaseAdmin.getUserLogs(userId)
                : (window.FirebaseDB || StorageDB).getAllLogs();

            const [fields, logs, members] = await Promise.all([
                FirebaseFarm.getFarmFields(farmId),
                logsPromise,
                FirebaseFarm.getMembers(farmId)
            ]);

            this.allFields = fields;
            this.allLogs = logs;
            this.farmMembers = members;
        } catch (e) {
            console.error('PastRecords loadData error:', e);
        }
    },

    renderFields() {
        // Clear existing
        this.fieldLayers.forEach(l => this.map.removeLayer(l));
        this.fieldLayers = [];

        if (!this.allFields.length) return;

        let bounds = null;

        this.allFields.forEach(field => {
            if (!field.geojson) return;

            const layer = L.geoJSON(field.geojson, {
                style: {
                    color: '#DAA520',
                    weight: 3,
                    fillColor: '#DAA520',
                    fillOpacity: 0.25
                }
            }).addTo(this.map);

            // Add label
            const center = layer.getBounds().getCenter();
            const label = L.tooltip({
                permanent: true,
                direction: 'center',
                className: 'field-label-tooltip'
            }).setContent(field.name || 'Unnamed').setLatLng(center);
            this.map.addLayer(label);
            this.fieldLayers.push(label);

            // Click handler
            layer.on('click', () => {
                this.onFieldClick(field);
            });

            this.fieldLayers.push(layer);

            if (!bounds) {
                bounds = layer.getBounds();
            } else {
                bounds.extend(layer.getBounds());
            }
        });

        if (bounds) {
            this.map.fitBounds(bounds, { padding: [30, 30] });
        }
    },

    pointInPolygon(point, polygon) {
        // Ray-casting algorithm
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

    getPolygonCoords(field) {
        // Extract polygon coordinates from geojson
        const coords = [];
        if (!field.geojson) return coords;

        const geojson = field.geojson;
        const features = geojson.features || [geojson];

        features.forEach(feature => {
            const geom = feature.geometry || feature;
            if (geom.type === 'Polygon') {
                // GeoJSON is [lng, lat], convert to [lat, lng]
                geom.coordinates[0].forEach(c => coords.push([c[1], c[0]]));
            } else if (geom.type === 'MultiPolygon') {
                geom.coordinates.forEach(poly => {
                    poly[0].forEach(c => coords.push([c[1], c[0]]));
                });
            }
        });
        return coords;
    },

    getLogsForField(field) {
        const polygon = this.getPolygonCoords(field);
        if (polygon.length === 0) return [];

        return this.allLogs.filter(log => {
            if (!log.path || log.path.length === 0) return false;
            // Check if any path point is inside the field polygon
            return log.path.some(pt => this.pointInPolygon([pt.lat, pt.lng], polygon));
        });
    },

    getSeason(dateStr) {
        const d = new Date(dateStr);
        const month = d.getMonth(); // 0-indexed
        const year = d.getFullYear();

        if (month >= 2 && month <= 4) return `Spring ${year}`;
        if (month >= 5 && month <= 7) return `Summer ${year}`;
        if (month >= 8 && month <= 10) return `Fall ${year}`;
        // Dec = current year winter, Jan/Feb = previous year's winter label
        if (month === 11) return `Winter ${year}`;
        return `Winter ${year - 1}`;
    },

    getOperatorName(userId) {
        const member = this.farmMembers.find(m => m.userId === userId);
        if (member) return member.name || member.email || userId;
        return userId || 'Unknown';
    },

    onFieldClick(field) {
        this.selectedField = field;
        const logs = this.getLogsForField(field);
        this.showRecordPanel(field, logs);
    },

    showRecordPanel(field, logs) {
        const panel = document.getElementById('record-panel');
        const content = document.getElementById('record-panel-content');

        if (logs.length === 0) {
            content.innerHTML = `<div style="padding:24px;text-align:center;color:#666;">No spreading records found for <b>${field.name || 'this field'}</b>.</div>`;
            panel.classList.remove('hidden');
            return;
        }

        // Group by season
        const grouped = {};
        logs.forEach(log => {
            const season = this.getSeason(log.timestamp);
            if (!grouped[season]) grouped[season] = [];
            grouped[season].push(log);
        });

        let html = `<div class="record-panel-header">
            <h3>${field.name || 'Unnamed Field'}</h3>
            <button class="btn-close-panel" onclick="PastRecords.hideRecordPanel()">&times;</button>
        </div>`;

        for (const [season, seasonLogs] of Object.entries(grouped)) {
            html += `<div class="season-header">${season}</div>`;
            seasonLogs.forEach(log => {
                const date = new Date(log.timestamp).toLocaleDateString();
                const storageName = log.storageName || 'N/A';
                const operator = this.getOperatorName(log.userId);
                const targetRate = log.targetRate ? `${log.targetRate} gal/ac` : 'N/A';
                const calcRate = log.calculatedRate ? `${log.calculatedRate.toFixed(0)} gal/ac` : 'N/A';

                html += `<div class="record-panel-item">
                    <div class="record-row">
                        <span class="record-label">Storage:</span>
                        <span>${storageName}</span>
                    </div>
                    <div class="record-row">
                        <span class="record-label">Operator:</span>
                        <span>${operator}</span>
                    </div>
                    <div class="record-row">
                        <span class="record-label">Date:</span>
                        <span>${date}</span>
                    </div>
                    <div class="record-row">
                        <span class="record-label">Target Rate:</span>
                        <span>${targetRate}</span>
                    </div>
                    <div class="record-row">
                        <span class="record-label">Calc. Rate:</span>
                        <span>${calcRate}</span>
                    </div>
                    <button class="btn btn-primary btn-edit-record" onclick="PastRecords.editRecord('${log.id}')">Edit</button>
                </div>`;
            });
        }

        content.innerHTML = html;
        panel.classList.remove('hidden');
    },

    hideRecordPanel() {
        document.getElementById('record-panel').classList.add('hidden');
    },

    editRecord(logId) {
        const log = this.allLogs.find(l => l.id === logId);
        if (!log) return;
        this.hideRecordPanel();
        App.showScreen('edit-record-screen');
        setTimeout(() => RecordEditor.init(log), 150);
    },

    cleanup() {
        if (this.map) {
            this.map.remove();
            this.map = null;
        }
        this.isInitialized = false;
        this.fieldLayers = [];
        this.allLogs = [];
        this.allFields = [];
        this.adminFarmId = null;
        this.adminUserId = null;
    }
};
