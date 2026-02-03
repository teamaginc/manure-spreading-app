// Leaflet map integration with satellite imagery and swath display

const MapManager = {
    map: null,
    tractorMarker: null,
    pathLine: null,
    swathCircles: [], // Array of circle overlays instead of single polygon
    pathCoordinates: [],
    swathWidth: 50, // Default width in feet
    isInitialized: false,
    priorSwaths: [], // Store prior session swaths
    manureColor: '#5d3000', // Darker brown for better contrast

    init() {
        if (this.isInitialized && this.map) {
            return;
        }

        // Initialize map centered on a default location (will be updated with GPS)
        this.map = L.map('map', {
            zoomControl: true,
            attributionControl: true
        }).setView([43.0, -89.4], 15);

        // Add ESRI World Imagery satellite tiles
        L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
            maxZoom: 19,
            attribution: 'Tiles &copy; Esri'
        }).addTo(this.map);

        // Add white overlay to lighten the imagery (increased opacity for more contrast)
        const whiteOverlay = L.rectangle([[-90, -180], [90, 180]], {
            color: 'white',
            weight: 0,
            fillColor: 'white',
            fillOpacity: 0.3, // Increased from 0.2
            interactive: false
        }).addTo(this.map);

        this.isInitialized = true;
    },

    setSwathWidth(widthFeet) {
        this.swathWidth = widthFeet || 50;
    },

    createTractorIcon(color = 'green') {
        const emoji = '🚜';
        const bgColor = this.getTractorBgColor(color);

        return L.divIcon({
            className: 'tractor-marker',
            html: `<div class="tractor-icon" style="background-color: ${bgColor}; padding: 4px 8px; border-radius: 50%; color: white;">${emoji}</div>`,
            iconSize: [48, 48],
            iconAnchor: [24, 24]
        });
    },

    getTractorBgColor(color) {
        const colors = {
            red: '#c41e3a',
            green: '#2d5a27',
            blue: '#1565c0',
            yellow: '#f9a825',
            orange: '#e65100'
        };
        return colors[color] || colors.green;
    },

    getManureColor(color) {
        // Darker colors for better contrast on lightened satellite imagery
        const colors = {
            brown: '#5d3000',      // Darker brown
            'dark-brown': '#3d2000', // Even darker
            black: '#1a1a1a',
            green: '#2d5016'       // Darker green
        };
        return colors[color] || colors.brown;
    },

    setTractorPosition(lat, lng, tractorColor = 'green') {
        if (!this.map) {
            console.error('Map not initialized');
            return;
        }

        const position = [lat, lng];

        if (!this.tractorMarker) {
            this.tractorMarker = L.marker(position, {
                icon: this.createTractorIcon(tractorColor)
            }).addTo(this.map);
        } else {
            this.tractorMarker.setLatLng(position);
            this.tractorMarker.setIcon(this.createTractorIcon(tractorColor));
        }

        // Center map on tractor
        this.map.setView(position, this.map.getZoom());
    },

    // Convert feet to meters
    feetToMeters(feet) {
        return feet * 0.3048;
    },

    startPath(manureColor = 'brown', widthFeet = 50) {
        this.pathCoordinates = [];
        this.swathWidth = widthFeet;
        this.manureColor = this.getManureColor(manureColor);

        // Clear existing swath circles
        this.clearSwathCircles();

        // Remove existing path line if any
        if (this.pathLine) {
            this.map.removeLayer(this.pathLine);
        }

        // Create center line (solid, darker)
        this.pathLine = L.polyline([], {
            color: this.manureColor,
            weight: 4,
            opacity: 1,
            lineCap: 'round',
            lineJoin: 'round'
        }).addTo(this.map);
    },

    clearSwathCircles() {
        this.swathCircles.forEach(circle => {
            if (this.map) {
                this.map.removeLayer(circle);
            }
        });
        this.swathCircles = [];
    },

    // Add a circle at a point for the swath
    addSwathCircle(lat, lng) {
        const radiusMeters = this.feetToMeters(this.swathWidth) / 2;

        const circle = L.circle([lat, lng], {
            radius: radiusMeters,
            color: this.manureColor,
            weight: 0,
            fillColor: this.manureColor,
            fillOpacity: 0.5,
            interactive: false
        }).addTo(this.map);

        this.swathCircles.push(circle);
    },

    // Add rectangle between two points to fill gaps between circles
    addSwathSegment(lat1, lng1, lat2, lng2) {
        const radiusMeters = this.feetToMeters(this.swathWidth) / 2;

        // Calculate bearing between points
        const bearing = this.calculateBearing(lat1, lng1, lat2, lng2);

        // Calculate the four corners of the rectangle
        const p1Left = this.destinationPoint(lat1, lng1, bearing - 90, radiusMeters);
        const p1Right = this.destinationPoint(lat1, lng1, bearing + 90, radiusMeters);
        const p2Left = this.destinationPoint(lat2, lng2, bearing - 90, radiusMeters);
        const p2Right = this.destinationPoint(lat2, lng2, bearing + 90, radiusMeters);

        const polygon = L.polygon([
            [p1Left.lat, p1Left.lng],
            [p2Left.lat, p2Left.lng],
            [p2Right.lat, p2Right.lng],
            [p1Right.lat, p1Right.lng]
        ], {
            color: this.manureColor,
            weight: 0,
            fillColor: this.manureColor,
            fillOpacity: 0.5,
            interactive: false
        }).addTo(this.map);

        this.swathCircles.push(polygon); // Store in same array for cleanup
    },

    // Calculate destination point given start, bearing, and distance
    destinationPoint(lat, lng, bearing, distanceMeters) {
        const R = 6371000; // Earth's radius in meters
        const d = distanceMeters / R;
        const brng = bearing * Math.PI / 180;
        const lat1 = lat * Math.PI / 180;
        const lng1 = lng * Math.PI / 180;

        const lat2 = Math.asin(
            Math.sin(lat1) * Math.cos(d) +
            Math.cos(lat1) * Math.sin(d) * Math.cos(brng)
        );

        const lng2 = lng1 + Math.atan2(
            Math.sin(brng) * Math.sin(d) * Math.cos(lat1),
            Math.cos(d) - Math.sin(lat1) * Math.sin(lat2)
        );

        return {
            lat: lat2 * 180 / Math.PI,
            lng: lng2 * 180 / Math.PI
        };
    },

    // Calculate bearing between two points
    calculateBearing(lat1, lng1, lat2, lng2) {
        const dLng = (lng2 - lng1) * Math.PI / 180;
        const lat1Rad = lat1 * Math.PI / 180;
        const lat2Rad = lat2 * Math.PI / 180;

        const y = Math.sin(dLng) * Math.cos(lat2Rad);
        const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) -
                  Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLng);

        let bearing = Math.atan2(y, x) * 180 / Math.PI;
        return (bearing + 360) % 360;
    },

    addPathPoint(lat, lng) {
        if (!this.pathLine) {
            console.error('Path not started');
            return;
        }

        const point = [lat, lng];

        // Add circle at this point
        this.addSwathCircle(lat, lng);

        // If we have a previous point, add a rectangle segment between them
        if (this.pathCoordinates.length > 0) {
            const prevPoint = this.pathCoordinates[this.pathCoordinates.length - 1];
            this.addSwathSegment(prevPoint[0], prevPoint[1], lat, lng);
        }

        this.pathCoordinates.push(point);
        this.pathLine.addLatLng(point);
    },

    getPathCoordinates() {
        return this.pathCoordinates.map(coord => ({
            lat: coord[0],
            lng: coord[1]
        }));
    },

    // Load and display prior session data
    loadPriorSession(log) {
        if (!this.map) {
            this.init();
        }

        // Clear existing prior swaths
        this.clearPriorSwaths();

        if (!log.path || log.path.length < 2) return;

        const pathColor = this.getManureColor(log.manureColor || 'brown');
        const radiusMeters = this.feetToMeters(log.spreadWidth || 50) / 2;

        // Draw circles and segments for prior session (lighter opacity)
        for (let i = 0; i < log.path.length; i++) {
            const point = log.path[i];

            // Add circle
            const circle = L.circle([point.lat, point.lng], {
                radius: radiusMeters,
                color: pathColor,
                weight: 0,
                fillColor: pathColor,
                fillOpacity: 0.3, // Lighter for prior sessions
                interactive: false
            }).addTo(this.map);
            this.priorSwaths.push(circle);

            // Add segment between points
            if (i > 0) {
                const prevPoint = log.path[i - 1];
                const bearing = this.calculateBearing(prevPoint.lat, prevPoint.lng, point.lat, point.lng);

                const p1Left = this.destinationPoint(prevPoint.lat, prevPoint.lng, bearing - 90, radiusMeters);
                const p1Right = this.destinationPoint(prevPoint.lat, prevPoint.lng, bearing + 90, radiusMeters);
                const p2Left = this.destinationPoint(point.lat, point.lng, bearing - 90, radiusMeters);
                const p2Right = this.destinationPoint(point.lat, point.lng, bearing + 90, radiusMeters);

                const polygon = L.polygon([
                    [p1Left.lat, p1Left.lng],
                    [p2Left.lat, p2Left.lng],
                    [p2Right.lat, p2Right.lng],
                    [p1Right.lat, p1Right.lng]
                ], {
                    color: pathColor,
                    weight: 0,
                    fillColor: pathColor,
                    fillOpacity: 0.3,
                    interactive: false
                }).addTo(this.map);
                this.priorSwaths.push(polygon);
            }
        }

        // Create prior center line (dashed to distinguish)
        const tempCoords = log.path.map(p => [p.lat, p.lng]);
        const priorLine = L.polyline(tempCoords, {
            color: pathColor,
            weight: 2,
            opacity: 0.6,
            dashArray: '5, 10'
        }).addTo(this.map);
        this.priorSwaths.push(priorLine);

        // Fit bounds to show prior session
        if (tempCoords.length > 0) {
            this.map.fitBounds(L.latLngBounds(tempCoords), { padding: [50, 50] });
        }
    },

    clearPriorSwaths() {
        this.priorSwaths.forEach(layer => {
            if (this.map) {
                this.map.removeLayer(layer);
            }
        });
        this.priorSwaths = [];
    },

    clearPath() {
        if (this.pathLine) {
            this.map.removeLayer(this.pathLine);
            this.pathLine = null;
        }
        this.clearSwathCircles();
        this.pathCoordinates = [];
    },

    clearTractor() {
        if (this.tractorMarker) {
            this.map.removeLayer(this.tractorMarker);
            this.tractorMarker = null;
        }
    },

    reset() {
        this.clearPath();
        this.clearTractor();
        this.clearPriorSwaths();
    },

    invalidateSize() {
        if (this.map) {
            setTimeout(() => {
                this.map.invalidateSize();
            }, 100);
        }
    },

    fitBoundsToPath() {
        if (this.pathLine && this.pathCoordinates.length > 1) {
            this.map.fitBounds(this.pathLine.getBounds(), { padding: [50, 50] });
        }
    },

    getMapBounds() {
        if (!this.map) return null;
        return this.map.getBounds();
    },

    getMapCenter() {
        if (!this.map) return null;
        const center = this.map.getCenter();
        return { lat: center.lat, lng: center.lng };
    },

    getMapZoom() {
        if (!this.map) return null;
        return this.map.getZoom();
    },

    fieldBoundaryLayers: [],

    addFieldBoundaries(fields) {
        this.clearFieldBoundaries();
        if (!this.map || !fields) return;

        fields.forEach(field => {
            if (!field.geojson) return;
            const layer = L.geoJSON(field.geojson, {
                style: {
                    color: '#39FF14',
                    weight: 3,
                    fillOpacity: 0,
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
            }).addTo(this.map);
            this.fieldBoundaryLayers.push(layer);
        });
    },

    clearFieldBoundaries() {
        this.fieldBoundaryLayers.forEach(layer => {
            if (this.map) this.map.removeLayer(layer);
        });
        this.fieldBoundaryLayers = [];
    }
};
