// Leaflet map integration with satellite imagery and swath display

const MapManager = {
    map: null,
    tractorMarker: null,
    pathLine: null,
    swathPolygon: null,
    pathCoordinates: [],
    swathWidth: 50, // Default width in feet
    isInitialized: false,
    priorSwaths: [], // Store prior session swaths

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
            attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
        }).addTo(this.map);

        this.isInitialized = true;
    },

    setSwathWidth(widthFeet) {
        this.swathWidth = widthFeet || 50;
    },

    createTractorIcon(color = 'red') {
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
        return colors[color] || colors.red;
    },

    getManureColor(color) {
        const colors = {
            brown: '#8b4513',
            'dark-brown': '#5d3a1a',
            black: '#2d2d2d',
            green: '#4a7c23'
        };
        return colors[color] || colors.brown;
    },

    setTractorPosition(lat, lng, tractorColor = 'red') {
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

    startPath(manureColor = 'brown', widthFeet = 50) {
        this.pathCoordinates = [];
        this.swathWidth = widthFeet;
        const pathColor = this.getManureColor(manureColor);

        // Remove existing path and swath if any
        if (this.pathLine) {
            this.map.removeLayer(this.pathLine);
        }
        if (this.swathPolygon) {
            this.map.removeLayer(this.swathPolygon);
        }

        // Create swath polygon (50% transparent)
        this.swathPolygon = L.polygon([], {
            color: pathColor,
            weight: 1,
            opacity: 0.5,
            fillColor: pathColor,
            fillOpacity: 0.5
        }).addTo(this.map);

        // Create center line (solid)
        this.pathLine = L.polyline([], {
            color: pathColor,
            weight: 4,
            opacity: 1,
            lineCap: 'round',
            lineJoin: 'round'
        }).addTo(this.map);
    },

    // Convert feet to meters
    feetToMeters(feet) {
        return feet * 0.3048;
    },

    // Calculate offset point perpendicular to direction of travel
    calculateOffsetPoint(lat, lng, bearing, distanceMeters, direction) {
        // direction: 1 for left, -1 for right
        const perpendicularBearing = bearing + (direction * 90);
        return this.destinationPoint(lat, lng, perpendicularBearing, distanceMeters);
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

    // Build swath polygon from path coordinates
    buildSwathPolygon() {
        if (this.pathCoordinates.length < 2) return [];

        const halfWidthMeters = this.feetToMeters(this.swathWidth) / 2;
        const leftSide = [];
        const rightSide = [];

        for (let i = 0; i < this.pathCoordinates.length; i++) {
            const current = this.pathCoordinates[i];
            let bearing;

            if (i === 0) {
                // First point - use bearing to next point
                const next = this.pathCoordinates[i + 1];
                bearing = this.calculateBearing(current[0], current[1], next[0], next[1]);
            } else if (i === this.pathCoordinates.length - 1) {
                // Last point - use bearing from previous point
                const prev = this.pathCoordinates[i - 1];
                bearing = this.calculateBearing(prev[0], prev[1], current[0], current[1]);
            } else {
                // Middle point - average bearings
                const prev = this.pathCoordinates[i - 1];
                const next = this.pathCoordinates[i + 1];
                const bearingIn = this.calculateBearing(prev[0], prev[1], current[0], current[1]);
                const bearingOut = this.calculateBearing(current[0], current[1], next[0], next[1]);
                bearing = (bearingIn + bearingOut) / 2;
            }

            const leftPoint = this.calculateOffsetPoint(current[0], current[1], bearing, halfWidthMeters, 1);
            const rightPoint = this.calculateOffsetPoint(current[0], current[1], bearing, halfWidthMeters, -1);

            leftSide.push([leftPoint.lat, leftPoint.lng]);
            rightSide.push([rightPoint.lat, rightPoint.lng]);
        }

        // Combine to form closed polygon (left side forward, right side backward)
        return [...leftSide, ...rightSide.reverse()];
    },

    addPathPoint(lat, lng) {
        if (!this.pathLine) {
            console.error('Path not started');
            return;
        }

        const point = [lat, lng];
        this.pathCoordinates.push(point);
        this.pathLine.addLatLng(point);

        // Update swath polygon
        if (this.pathCoordinates.length >= 2) {
            const swathCoords = this.buildSwathPolygon();
            this.swathPolygon.setLatLngs(swathCoords);
        }
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
        const width = log.spreadWidth || 50;

        // Temporarily set swath width for calculation
        const originalWidth = this.swathWidth;
        this.swathWidth = width;

        // Convert log path to pathCoordinates format for swath calculation
        const tempCoords = log.path.map(p => [p.lat, p.lng]);
        const originalCoords = this.pathCoordinates;
        this.pathCoordinates = tempCoords;

        // Build swath for prior session (more transparent to distinguish from current)
        const swathCoords = this.buildSwathPolygon();

        // Create prior swath polygon (lighter opacity)
        const priorSwath = L.polygon(swathCoords, {
            color: pathColor,
            weight: 1,
            opacity: 0.3,
            fillColor: pathColor,
            fillOpacity: 0.3
        }).addTo(this.map);

        // Create prior center line (dashed to distinguish)
        const priorLine = L.polyline(tempCoords, {
            color: pathColor,
            weight: 2,
            opacity: 0.6,
            dashArray: '5, 10'
        }).addTo(this.map);

        this.priorSwaths.push(priorSwath, priorLine);

        // Restore original values
        this.swathWidth = originalWidth;
        this.pathCoordinates = originalCoords;

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
        if (this.swathPolygon) {
            this.map.removeLayer(this.swathPolygon);
            this.swathPolygon = null;
        }
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

    // Get current map state for PNG export
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
    }
};
