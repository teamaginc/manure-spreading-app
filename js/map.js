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
    overlayLayer: null,

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

        // Add semi-transparent white overlay to lighten the imagery
        this.overlayLayer = L.tileLayer('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==', {
            opacity: 0.25
        }).addTo(this.map);

        // Alternative: Add a white rectangle overlay
        // This creates a lightening effect on the satellite imagery
        const whiteOverlay = L.rectangle([[-90, -180], [90, 180]], {
            color: 'white',
            weight: 0,
            fillColor: 'white',
            fillOpacity: 0.2,
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
        const colors = {
            brown: '#8b4513',
            'dark-brown': '#5d3a1a',
            black: '#2d2d2d',
            green: '#4a7c23'
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

    // Generate points along a circular arc
    generateArcPoints(centerLat, centerLng, radius, startAngle, endAngle, numPoints = 8) {
        const points = [];

        // Normalize angles
        let start = startAngle;
        let end = endAngle;

        // Handle angle wrapping
        if (end < start) {
            end += 360;
        }

        const angleStep = (end - start) / numPoints;

        for (let i = 0; i <= numPoints; i++) {
            const angle = start + (i * angleStep);
            const point = this.destinationPoint(centerLat, centerLng, angle, radius);
            points.push([point.lat, point.lng]);
        }

        return points;
    },

    // Build a proper buffered polygon (like ArcGIS buffer)
    buildBufferedPolygon() {
        if (this.pathCoordinates.length < 1) return [];

        const bufferRadius = this.feetToMeters(this.swathWidth) / 2;

        // For a single point, return a circle
        if (this.pathCoordinates.length === 1) {
            const center = this.pathCoordinates[0];
            const circlePoints = [];
            for (let angle = 0; angle < 360; angle += 15) {
                const pt = this.destinationPoint(center[0], center[1], angle, bufferRadius);
                circlePoints.push([pt.lat, pt.lng]);
            }
            return circlePoints;
        }

        // For multiple points, create a proper buffer with rounded ends and joins
        const leftSide = [];
        const rightSide = [];

        for (let i = 0; i < this.pathCoordinates.length; i++) {
            const current = this.pathCoordinates[i];

            if (i === 0) {
                // First point - add a semicircle cap at the start
                const next = this.pathCoordinates[i + 1];
                const bearing = this.calculateBearing(current[0], current[1], next[0], next[1]);

                // Generate semicircle from right side to left side (going backwards)
                const capPoints = this.generateArcPoints(
                    current[0], current[1],
                    bufferRadius,
                    bearing + 90,
                    bearing + 270,
                    8
                );
                leftSide.push(...capPoints);

            } else if (i === this.pathCoordinates.length - 1) {
                // Last point - add perpendicular points and end cap
                const prev = this.pathCoordinates[i - 1];
                const bearing = this.calculateBearing(prev[0], prev[1], current[0], current[1]);

                // Add left perpendicular point
                const leftPt = this.destinationPoint(current[0], current[1], bearing - 90, bufferRadius);
                leftSide.push([leftPt.lat, leftPt.lng]);

                // Generate semicircle cap at the end (from left to right)
                const capPoints = this.generateArcPoints(
                    current[0], current[1],
                    bufferRadius,
                    bearing - 90,
                    bearing + 90,
                    8
                );
                // Add cap points to right side (will be reversed later)
                rightSide.push(...capPoints.reverse());

            } else {
                // Middle points - calculate proper miter or rounded join
                const prev = this.pathCoordinates[i - 1];
                const next = this.pathCoordinates[i + 1];

                const bearingIn = this.calculateBearing(prev[0], prev[1], current[0], current[1]);
                const bearingOut = this.calculateBearing(current[0], current[1], next[0], next[1]);

                // Calculate the turn angle
                let turnAngle = bearingOut - bearingIn;
                if (turnAngle > 180) turnAngle -= 360;
                if (turnAngle < -180) turnAngle += 360;

                // For the left side
                const leftIn = (bearingIn - 90 + 360) % 360;
                const leftOut = (bearingOut - 90 + 360) % 360;

                // For the right side
                const rightIn = (bearingIn + 90) % 360;
                const rightOut = (bearingOut + 90) % 360;

                if (Math.abs(turnAngle) < 5) {
                    // Nearly straight - just add single points
                    const leftPt = this.destinationPoint(current[0], current[1], leftIn, bufferRadius);
                    const rightPt = this.destinationPoint(current[0], current[1], rightIn, bufferRadius);
                    leftSide.push([leftPt.lat, leftPt.lng]);
                    rightSide.push([rightPt.lat, rightPt.lng]);
                } else if (turnAngle > 0) {
                    // Turning right - left side needs arc, right side gets single point
                    const arcPoints = this.generateArcPoints(
                        current[0], current[1],
                        bufferRadius,
                        leftIn,
                        leftOut,
                        Math.max(3, Math.ceil(Math.abs(turnAngle) / 20))
                    );
                    leftSide.push(...arcPoints);

                    // Right side - single point at the inner corner
                    const rightPt = this.destinationPoint(current[0], current[1], (rightIn + rightOut) / 2, bufferRadius);
                    rightSide.push([rightPt.lat, rightPt.lng]);
                } else {
                    // Turning left - right side needs arc, left side gets single point
                    const leftPt = this.destinationPoint(current[0], current[1], (leftIn + leftOut) / 2, bufferRadius);
                    leftSide.push([leftPt.lat, leftPt.lng]);

                    // Right side needs arc
                    let arcStart = rightIn;
                    let arcEnd = rightOut;
                    if (arcEnd > arcStart) {
                        arcStart += 360;
                    }
                    const arcPoints = this.generateArcPoints(
                        current[0], current[1],
                        bufferRadius,
                        arcEnd,
                        arcStart,
                        Math.max(3, Math.ceil(Math.abs(turnAngle) / 20))
                    );
                    rightSide.push(...arcPoints.reverse());
                }
            }
        }

        // Combine: left side forward, then right side backward
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

        // Update swath polygon with proper buffer
        const swathCoords = this.buildBufferedPolygon();
        if (swathCoords.length >= 3) {
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

        // Build swath for prior session
        const swathCoords = this.buildBufferedPolygon();

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
