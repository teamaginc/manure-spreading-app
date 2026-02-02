// Record Editor - Lasso select and delete GPS points from a log

const RecordEditor = {
    map: null,
    isInitialized: false,
    currentLog: null,
    pathPoints: [],        // Working copy of path points
    pointMarkers: [],      // Leaflet circle markers
    pathLine: null,        // Polyline
    selectedIndices: [],   // Indices of selected (red) points
    undoStack: [],         // Stack of deleted point batches for undo
    drawControl: null,
    drawnItems: null,

    init(log) {
        this.currentLog = log;
        this.pathPoints = log.path ? JSON.parse(JSON.stringify(log.path)) : [];
        this.selectedIndices = [];
        this.undoStack = [];

        if (this.map) {
            this.map.remove();
            this.map = null;
        }

        this.map = L.map('edit-record-map', {
            zoomControl: true,
            attributionControl: true
        }).setView([43.0, -89.4], 15);

        L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
            maxZoom: 19,
            attribution: 'Tiles &copy; Esri'
        }).addTo(this.map);

        // Setup draw layer for lasso
        this.drawnItems = new L.FeatureGroup();
        this.map.addLayer(this.drawnItems);

        this.isInitialized = true;
        this.redrawPath();
        this.setupToolbar();
    },

    redrawPath() {
        // Clear existing
        this.pointMarkers.forEach(m => this.map.removeLayer(m));
        this.pointMarkers = [];
        if (this.pathLine) this.map.removeLayer(this.pathLine);

        if (this.pathPoints.length === 0) return;

        // Draw polyline
        const coords = this.pathPoints.map(p => [p.lat, p.lng]);
        this.pathLine = L.polyline(coords, {
            color: '#5d3000',
            weight: 3,
            opacity: 0.8
        }).addTo(this.map);

        // Draw point markers
        this.pathPoints.forEach((pt, i) => {
            const isSelected = this.selectedIndices.includes(i);
            const marker = L.circleMarker([pt.lat, pt.lng], {
                radius: 6,
                color: isSelected ? '#ff0000' : '#2196F3',
                fillColor: isSelected ? '#ff0000' : '#2196F3',
                fillOpacity: 0.8,
                weight: 2
            }).addTo(this.map);
            this.pointMarkers.push(marker);
        });

        // Fit bounds
        if (coords.length > 0) {
            this.map.fitBounds(L.latLngBounds(coords), { padding: [40, 40] });
        }

        this.updatePointCount();
    },

    updatePointCount() {
        const el = document.getElementById('edit-point-count');
        if (el) {
            el.textContent = `${this.pathPoints.length} points | ${this.selectedIndices.length} selected`;
        }
    },

    setupToolbar() {
        document.getElementById('edit-lasso-btn').onclick = () => this.enableLasso();
        document.getElementById('edit-delete-btn').onclick = () => this.deleteSelected();
        document.getElementById('edit-undo-btn').onclick = () => this.undo();
        document.getElementById('edit-save-btn').onclick = () => this.save();
    },

    enableLasso() {
        // Clear previous drawn items
        this.drawnItems.clearLayers();

        // Enable polygon draw
        const drawHandler = new L.Draw.Polygon(this.map, {
            shapeOptions: {
                color: '#ff4444',
                weight: 2,
                fillOpacity: 0.1
            }
        });
        drawHandler.enable();

        // Listen for draw complete
        this.map.once(L.Draw.Event.CREATED, (e) => {
            const layer = e.layer;
            this.drawnItems.addLayer(layer);
            this.onLassoComplete(layer);

            // Remove lasso polygon after brief delay
            setTimeout(() => {
                this.drawnItems.clearLayers();
            }, 500);
        });
    },

    onLassoComplete(polygon) {
        const latlngs = polygon.getLatLngs()[0];
        const polyCoords = latlngs.map(ll => [ll.lat, ll.lng]);

        // Find points inside the polygon
        this.selectedIndices = [];
        this.pathPoints.forEach((pt, i) => {
            if (this.pointInPolygon([pt.lat, pt.lng], polyCoords)) {
                this.selectedIndices.push(i);
            }
        });

        this.redrawPath();
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

    deleteSelected() {
        if (this.selectedIndices.length === 0) {
            alert('No points selected. Use Lasso to select points first.');
            return;
        }

        // Save deleted points for undo
        const deleted = this.selectedIndices.map(i => ({
            index: i,
            point: this.pathPoints[i]
        }));
        this.undoStack.push(deleted);

        // Remove points (in reverse order to maintain indices)
        const sortedIndices = [...this.selectedIndices].sort((a, b) => b - a);
        sortedIndices.forEach(i => {
            this.pathPoints.splice(i, 1);
        });

        this.selectedIndices = [];
        this.redrawPath();
    },

    undo() {
        if (this.undoStack.length === 0) {
            alert('Nothing to undo.');
            return;
        }

        const deleted = this.undoStack.pop();

        // Re-insert in original order (sorted by index ascending)
        deleted.sort((a, b) => a.index - b.index);
        deleted.forEach(item => {
            this.pathPoints.splice(item.index, 0, item.point);
        });

        this.selectedIndices = [];
        this.redrawPath();
    },

    async save() {
        if (!this.currentLog) return;

        // Recalculate distance and rate
        let totalDistanceMeters = 0;
        for (let i = 1; i < this.pathPoints.length; i++) {
            totalDistanceMeters += SpreadingTracker.calculateDistance(
                this.pathPoints[i - 1].lat, this.pathPoints[i - 1].lng,
                this.pathPoints[i].lat, this.pathPoints[i].lng
            );
        }

        const spreadWidthFeet = this.currentLog.spreadWidth || 50;
        const totalDistanceFeet = totalDistanceMeters * 3.28084;
        const acresCovered = (totalDistanceFeet * spreadWidthFeet) / 43560;

        let calculatedRate = null;
        if (this.currentLog.equipmentCapacity && this.currentLog.loadCount && acresCovered > 0) {
            calculatedRate = (this.currentLog.equipmentCapacity * this.currentLog.loadCount) / acresCovered;
        }

        const updatedData = {
            path: this.pathPoints,
            totalDistanceMeters: totalDistanceMeters,
            acresCovered: acresCovered,
            calculatedRate: calculatedRate,
            editedAt: new Date().toISOString()
        };

        try {
            const dbHandler = window.FirebaseDB || StorageDB;
            if (dbHandler.updateLog) {
                await dbHandler.updateLog(this.currentLog.id, updatedData);
            } else {
                // Fallback: merge and save full log
                const merged = { ...this.currentLog, ...updatedData };
                await dbHandler.saveLog(merged);
            }
            alert('Record saved successfully.');
            this.cleanup();
            App.showScreen('past-records-screen');
            setTimeout(() => PastRecords.init(), 150);
        } catch (e) {
            console.error('Failed to save edited record:', e);
            alert('Failed to save: ' + e.message);
        }
    },

    cleanup() {
        if (this.map) {
            this.map.remove();
            this.map = null;
        }
        this.isInitialized = false;
        this.pathPoints = [];
        this.pointMarkers = [];
        this.selectedIndices = [];
        this.undoStack = [];
    }
};
