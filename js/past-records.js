// Past Records Viewer - View spreading records by field

const PastRecords = {
    map: null,
    isInitialized: false,
    fieldLayers: [],
    pathLayers: [],
    allLogs: [],
    allFields: [],
    farmMembers: [],
    currentFarmId: null,
    currentFarmName: null,
    userFarms: [],
    selectedField: null,
    selectedFieldLogs: [],
    selectedLogId: null,
    adminFarmId: null,  // Set by AdminPanel to scope fields to a specific farm
    adminUserId: null,  // Set by AdminPanel to scope logs to a specific user

    // Color palette for spreading paths
    pathColors: ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F'],

    // Default manure color for swaths
    manureColor: '#5d3000',

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
        this.setupFilterListeners();
        this.setupResizeHandle();

        await this.loadData();
        this.renderFields();
        this.populateFilters();
        this.renderTable();
    },

    setupResizeHandle() {
        const handle = document.getElementById('records-resize-handle');
        const panel = document.getElementById('records-table-panel');
        const screen = document.getElementById('past-records-screen');

        if (!handle || !panel || !screen) return;

        let isDragging = false;
        let startY = 0;
        let startHeight = 0;

        const onStart = (e) => {
            isDragging = true;
            startY = e.type.includes('touch') ? e.touches[0].clientY : e.clientY;
            startHeight = panel.offsetHeight;
            document.body.style.cursor = 'ns-resize';
            document.body.style.userSelect = 'none';
            e.preventDefault();
        };

        const onMove = (e) => {
            if (!isDragging) return;

            const clientY = e.type.includes('touch') ? e.touches[0].clientY : e.clientY;
            const deltaY = startY - clientY; // Negative when dragging down, positive when dragging up
            const newHeight = startHeight + deltaY;

            // Get screen bounds (excluding header)
            const header = screen.querySelector('.screen-header');
            const headerHeight = header ? header.offsetHeight : 0;
            const availableHeight = screen.offsetHeight - headerHeight - 24; // 24 for handle height

            // Constrain height: min 120px, max 70% of available space
            const minHeight = 120;
            const maxHeight = availableHeight * 0.7;
            const clampedHeight = Math.max(minHeight, Math.min(maxHeight, newHeight));

            panel.style.height = clampedHeight + 'px';

            // Invalidate map size since container changed
            if (this.map) {
                this.map.invalidateSize();
            }
        };

        const onEnd = () => {
            if (!isDragging) return;
            isDragging = false;
            document.body.style.cursor = '';
            document.body.style.userSelect = '';

            // Save preference to localStorage
            const heightPercent = (panel.offsetHeight / screen.offsetHeight * 100).toFixed(1);
            localStorage.setItem('pastRecordsPanelHeight', heightPercent);
        };

        // Mouse events
        handle.addEventListener('mousedown', onStart);
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onEnd);

        // Touch events
        handle.addEventListener('touchstart', onStart, { passive: false });
        document.addEventListener('touchmove', onMove, { passive: false });
        document.addEventListener('touchend', onEnd);

        // Restore saved height preference
        const savedHeight = localStorage.getItem('pastRecordsPanelHeight');
        if (savedHeight) {
            const height = (parseFloat(savedHeight) / 100) * screen.offsetHeight;
            if (height >= 120) {
                panel.style.height = height + 'px';
            }
        }
    },

    setupFilterListeners() {
        ['filter-year', 'filter-season', 'filter-field', 'filter-operator'].forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('change', () => this.renderTable());
            }
        });

        // Farm selector
        const farmSelect = document.getElementById('past-records-farm-select');
        if (farmSelect) {
            farmSelect.addEventListener('change', () => {
                this.switchFarm(farmSelect.value);
            });
        }
    },

    populateFilters() {
        const years = new Set();
        const seasons = new Set();
        const operators = new Set();

        this.allLogs.forEach(log => {
            if (log.timestamp) {
                const d = new Date(log.timestamp);
                years.add(d.getFullYear());
                seasons.add(this.getSeasonName(log.timestamp));
            }
            if (log.userId) {
                operators.add(log.userId);
            }
        });

        // Populate year filter
        const yearSelect = document.getElementById('filter-year');
        if (yearSelect) {
            yearSelect.innerHTML = '<option value="">All Years</option>';
            [...years].sort((a, b) => b - a).forEach(y => {
                yearSelect.innerHTML += `<option value="${y}">${y}</option>`;
            });
        }

        // Populate season filter
        const seasonSelect = document.getElementById('filter-season');
        if (seasonSelect) {
            seasonSelect.innerHTML = '<option value="">All Seasons</option>';
            ['Spring', 'Summer', 'Fall', 'Winter'].forEach(s => {
                if ([...seasons].some(ss => ss.startsWith(s))) {
                    seasonSelect.innerHTML += `<option value="${s}">${s}</option>`;
                }
            });
        }

        // Populate field filter
        const fieldSelect = document.getElementById('filter-field');
        if (fieldSelect) {
            fieldSelect.innerHTML = '<option value="">All Fields</option>';
            this.allFields.forEach(f => {
                fieldSelect.innerHTML += `<option value="${f.id}">${f.name || 'Unnamed'}</option>`;
            });
        }

        // Populate operator filter
        const operatorSelect = document.getElementById('filter-operator');
        if (operatorSelect) {
            operatorSelect.innerHTML = '<option value="">All Operators</option>';
            [...operators].forEach(uid => {
                const name = this.getOperatorName(uid);
                operatorSelect.innerHTML += `<option value="${uid}">${name}</option>`;
            });
        }
    },

    getSeasonName(dateStr) {
        const d = new Date(dateStr);
        const month = d.getMonth();
        if (month >= 2 && month <= 4) return 'Spring';
        if (month >= 5 && month <= 7) return 'Summer';
        if (month >= 8 && month <= 10) return 'Fall';
        return 'Winter';
    },

    getFieldForLog(log) {
        if (!log.path || log.path.length === 0) return null;
        for (const field of this.allFields) {
            const polygon = this.getPolygonCoords(field);
            if (polygon.length === 0) continue;
            if (log.path.some(pt => this.pointInPolygon([pt.lat, pt.lng], polygon))) {
                return field;
            }
        }
        return null;
    },

    getFilteredLogs() {
        const yearFilter = document.getElementById('filter-year')?.value;
        const seasonFilter = document.getElementById('filter-season')?.value;
        const fieldFilter = document.getElementById('filter-field')?.value;
        const operatorFilter = document.getElementById('filter-operator')?.value;

        return this.allLogs.filter(log => {
            if (yearFilter && log.timestamp) {
                const year = new Date(log.timestamp).getFullYear();
                if (year !== parseInt(yearFilter)) return false;
            }
            if (seasonFilter && log.timestamp) {
                const season = this.getSeasonName(log.timestamp);
                if (season !== seasonFilter) return false;
            }
            if (fieldFilter) {
                const field = this.getFieldForLog(log);
                if (!field || field.id !== fieldFilter) return false;
            }
            if (operatorFilter && log.userId !== operatorFilter) {
                return false;
            }
            return true;
        });
    },

    renderTable() {
        const tbody = document.getElementById('records-table-body');
        if (!tbody) return;

        const logs = this.getFilteredLogs();

        if (logs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#666;padding:24px;">No records found matching filters.</td></tr>';
            return;
        }

        // Sort by date descending
        logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        tbody.innerHTML = logs.map(log => {
            const date = log.timestamp ? new Date(log.timestamp).toLocaleDateString() : 'N/A';
            const field = this.getFieldForLog(log);
            const fieldName = field ? (field.name || 'Unnamed') : 'Unknown';
            const operator = this.getOperatorName(log.userId);
            const storage = log.storageName || 'N/A';
            const targetRate = log.targetRate ? `${log.targetRate}` : '-';
            const calcRate = log.calculatedRate ? `${log.calculatedRate.toFixed(0)}` : '-';

            return `<tr data-log-id="${log.id}" onclick="PastRecords.onTableRowClick('${log.id}')">
                <td>${date}</td>
                <td>${fieldName}</td>
                <td>${operator}</td>
                <td>${storage}</td>
                <td>${targetRate}</td>
                <td>${calcRate}</td>
                <td><button class="btn-edit-small" onclick="event.stopPropagation();PastRecords.editRecord('${log.id}')">Edit</button></td>
            </tr>`;
        }).join('');
    },

    onTableRowClick(logId) {
        // Clear previous selection
        document.querySelectorAll('#records-table-body tr.selected').forEach(tr => tr.classList.remove('selected'));

        // Select new row
        const row = document.querySelector(`#records-table-body tr[data-log-id="${logId}"]`);
        if (row) row.classList.add('selected');

        this.selectedLogId = logId;
        const log = this.allLogs.find(l => l.id === logId);
        if (!log) return;

        // Clear and draw this log's path with swath
        this.clearPaths();
        if (log.path && log.path.length >= 2) {
            this.drawSwathPath(log, '#FF6B6B');
            const coords = log.path.map(p => [p.lat, p.lng]);
            this.map.fitBounds(L.latLngBounds(coords), { padding: [50, 50] });
        }
    },

    // Helper: convert feet to meters
    feetToMeters(feet) {
        return feet * 0.3048;
    },

    // Helper: calculate bearing between two points
    calculateBearing(lat1, lng1, lat2, lng2) {
        const toRad = x => x * Math.PI / 180;
        const toDeg = x => x * 180 / Math.PI;
        const dLng = toRad(lng2 - lng1);
        const y = Math.sin(dLng) * Math.cos(toRad(lat2));
        const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
                  Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLng);
        return (toDeg(Math.atan2(y, x)) + 360) % 360;
    },

    // Helper: get destination point from start, bearing, and distance
    destinationPoint(lat, lng, bearing, distanceMeters) {
        const R = 6371000;
        const toRad = x => x * Math.PI / 180;
        const toDeg = x => x * 180 / Math.PI;
        const brng = toRad(bearing);
        const lat1 = toRad(lat);
        const lng1 = toRad(lng);
        const lat2 = Math.asin(Math.sin(lat1) * Math.cos(distanceMeters / R) +
                    Math.cos(lat1) * Math.sin(distanceMeters / R) * Math.cos(brng));
        const lng2 = lng1 + Math.atan2(Math.sin(brng) * Math.sin(distanceMeters / R) * Math.cos(lat1),
                    Math.cos(distanceMeters / R) - Math.sin(lat1) * Math.sin(lat2));
        return { lat: toDeg(lat2), lng: toDeg(lng2) };
    },

    // Draw swath path using individual segments in a custom pane for uniform opacity
    drawSwathPath(log, color) {
        const spreadWidth = log.spreadWidth || 50;
        const bufferDist = this.feetToMeters(spreadWidth) / 2;
        const swathColor = this.manureColor;

        if (log.path.length < 2) return;

        // Create a custom pane for swaths if it doesn't exist
        if (!this.map.getPane('swathPane')) {
            this.map.createPane('swathPane');
            this.map.getPane('swathPane').style.zIndex = 400;
            this.map.getPane('swathPane').style.opacity = '0.25';
        }

        // Draw each segment as a separate quadrilateral in the swath pane
        for (let i = 0; i < log.path.length - 1; i++) {
            const p1 = log.path[i];
            const p2 = log.path[i + 1];
            const bearing = this.calculateBearing(p1.lat, p1.lng, p2.lat, p2.lng);
            const perpLeft = (bearing + 270) % 360;
            const perpRight = (bearing + 90) % 360;

            // Four corners of this segment's swath
            const corner1 = this.destinationPoint(p1.lat, p1.lng, perpLeft, bufferDist);
            const corner2 = this.destinationPoint(p1.lat, p1.lng, perpRight, bufferDist);
            const corner3 = this.destinationPoint(p2.lat, p2.lng, perpRight, bufferDist);
            const corner4 = this.destinationPoint(p2.lat, p2.lng, perpLeft, bufferDist);

            const segment = L.polygon([
                [corner1.lat, corner1.lng],
                [corner2.lat, corner2.lng],
                [corner3.lat, corner3.lng],
                [corner4.lat, corner4.lng]
            ], {
                pane: 'swathPane',
                color: swathColor,
                weight: 0,
                fillColor: swathColor,
                fillOpacity: 1,  // Full opacity - pane controls overall transparency
                stroke: false
            }).addTo(this.map);

            this.pathLayers.push(segment);
        }

        // Add center line (not in swath pane, so full opacity)
        const coords = log.path.map(p => [p.lat, p.lng]);
        const polyline = L.polyline(coords, {
            color: color,
            weight: 2,
            opacity: 0.8
        }).addTo(this.map);
        this.pathLayers.push(polyline);
    },

    async loadData() {
        try {
            let farmId = this.adminFarmId;
            let userId = this.adminUserId;
            const user = window.FirebaseAuth && FirebaseAuth.getCurrentUser();

            if (!farmId) {
                if (!user) {
                    console.warn('PastRecords: No user logged in');
                    return;
                }

                // Wait for Firebase modules to load (ES module timing)
                let attempts = 0;
                while ((!window.FirebaseFarm || !window.FirebaseAdmin) && attempts < 30) {
                    await new Promise(r => setTimeout(r, 150));
                    attempts++;
                }

                if (!window.FirebaseFarm || !window.FirebaseAdmin) {
                    console.warn('PastRecords: Firebase modules not available after waiting');
                    return;
                }

                // Get all farms user has access to
                if (window.FirebaseAdmin) {
                    try {
                        this.userFarms = await FirebaseAdmin.getFarmsForUser(user.uid);
                        console.log('PastRecords: Found farms for user:', this.userFarms.length, this.userFarms.map(f => f.name));
                    } catch (e) {
                        console.error('PastRecords: getFarmsForUser failed:', e);
                        this.userFarms = [];
                    }
                }

                // Use saved farm preference, or first available farm
                const savedFarmId = localStorage.getItem('pastRecordsFarmId');
                if (savedFarmId && this.userFarms.some(f => f.id === savedFarmId)) {
                    farmId = savedFarmId;
                } else if (this.userFarms.length > 0) {
                    farmId = this.userFarms[0].id;
                } else {
                    // Fallback to user's own farm via farmId field
                    const farm = await FirebaseFarm.getFarmByUser(user.uid);
                    if (farm) {
                        farmId = farm.id;
                        this.userFarms = [{ ...farm, memberRole: 'owner' }];
                    }
                }
            }

            if (!farmId) {
                console.warn('PastRecords: No farm found for user');
                this.updateFarmIndicator();
                // Load just the current user's own logs as fallback
                this.allLogs = await (window.FirebaseDB || StorageDB).getAllLogs();
                return;
            }

            this.currentFarmId = farmId;

            // Load fields and members
            const [fields, members] = await Promise.all([
                FirebaseFarm.getFarmFields(farmId),
                FirebaseFarm.getMembers(farmId)
            ]);

            this.allFields = fields;
            this.farmMembers = members;

            // Get farm name
            const farmDoc = await FirebaseFarm.getFarm(farmId);
            this.currentFarmName = farmDoc?.name || 'Unknown Farm';

            // Ensure the current farm is in userFarms
            if (this.userFarms.length === 0 && farmDoc) {
                this.userFarms = [{ ...farmDoc, memberRole: 'owner' }];
            } else if (!this.userFarms.some(f => f.id === farmId) && farmDoc) {
                this.userFarms.unshift({ ...farmDoc, memberRole: 'member' });
            }

            // Now update dropdown with complete data
            this.updateFarmIndicator();
            console.log('PastRecords: Farm dropdown updated with', this.userFarms.length, 'farms');

            // Load logs from ALL farm members (or specific user if admin-scoped)
            if (userId && window.FirebaseAdmin) {
                this.allLogs = await FirebaseAdmin.getUserLogs(userId);
            } else if (window.FirebaseAdmin) {
                // Load logs from all members of the farm
                const allLogs = [];
                for (const member of members) {
                    if (!member.userId) continue;
                    try {
                        const memberLogs = await FirebaseAdmin.getUserLogs(member.userId);
                        allLogs.push(...memberLogs);
                    } catch (e) {
                        console.warn('Could not load logs for member:', member.userId, e);
                    }
                }
                this.allLogs = allLogs;
            } else {
                // No admin access, just load own logs
                this.allLogs = await (window.FirebaseDB || StorageDB).getAllLogs();
            }
        } catch (e) {
            console.error('PastRecords loadData error:', e);
        }
    },

    updateFarmIndicator() {
        const selector = document.getElementById('past-records-farm-select');
        if (!selector) return;

        if (this.userFarms.length > 0) {
            selector.innerHTML = this.userFarms.map(f =>
                `<option value="${f.id}" ${f.id === this.currentFarmId ? 'selected' : ''}>${f.name || 'Unnamed Farm'}</option>`
            ).join('');
        } else if (this.currentFarmName) {
            selector.innerHTML = `<option value="${this.currentFarmId}">${this.currentFarmName}</option>`;
        }
    },

    async switchFarm(farmId) {
        if (farmId === this.currentFarmId) return;
        localStorage.setItem('pastRecordsFarmId', farmId);

        // Reset state
        this.clearPaths();
        this.fieldLayers.forEach(l => this.map.removeLayer(l));
        this.fieldLayers = [];
        this.allLogs = [];
        this.allFields = [];
        this.selectedLogId = null;

        this.currentFarmId = farmId;
        await this.loadData();
        this.renderFields();
        this.populateFilters();
        this.renderTable();
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
                    color: '#39FF14',
                    weight: 3,
                    fillOpacity: 0
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
        this.selectedFieldLogs = logs;

        // Clear previous paths and draw new ones
        this.clearPaths();
        this.drawLogPaths(logs);

        this.showRecordPanel(field, logs);
    },

    drawLogPaths(logs) {
        logs.forEach((log, index) => {
            if (!log.path || log.path.length < 2) return;

            const color = this.pathColors[index % this.pathColors.length];
            this.drawSwathPath(log, color);
        });
    },

    clearPaths() {
        this.pathLayers.forEach(layer => this.map.removeLayer(layer));
        this.pathLayers = [];
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

        // Add export controls at the bottom
        html += `<div style="padding:12px 16px;border-top:1px solid #ddd;">
            <div style="display:flex;gap:8px;align-items:center;">
                <select id="field-export-format" style="flex:1;padding:10px;border-radius:6px;border:1px solid #ddd;font-size:0.9rem;">
                    <option value="csv">CSV</option>
                    <option value="kmz">KMZ</option>
                    <option value="png">PNG</option>
                </select>
                <button class="btn btn-primary" onclick="PastRecords.exportFieldRecords()" style="padding:10px 16px;font-size:0.9rem;">Export Field Records</button>
            </div>
        </div>`;

        content.innerHTML = html;
        panel.classList.remove('hidden');
    },

    async exportFieldRecords() {
        if (!this.selectedFieldLogs || this.selectedFieldLogs.length === 0) {
            alert('No records to export for this field.');
            return;
        }

        const formatSelect = document.getElementById('field-export-format');
        const format = formatSelect ? formatSelect.value : 'csv';
        const fieldName = this.selectedField?.name || 'field';
        const date = new Date().toISOString().split('T')[0];
        const filename = `manure-spreading-${fieldName.replace(/\s+/g, '-')}-${date}`;

        try {
            const result = await ExportManager.shareOrDownload(this.selectedFieldLogs, filename, format, true);
            if (result.method === 'download') {
                alert(`Downloaded ${this.selectedFieldLogs.length} record(s) as ${format.toUpperCase()} file.`);
            }
        } catch (error) {
            console.error('Export failed:', error);
            alert('Failed to export records. Please try again.');
        }
    },

    hideRecordPanel() {
        document.getElementById('record-panel').classList.add('hidden');
        this.clearPaths();
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
        this.pathLayers = [];
        this.allLogs = [];
        this.allFields = [];
        this.farmMembers = [];
        this.currentFarmId = null;
        this.currentFarmName = null;
        this.userFarms = [];
        this.selectedFieldLogs = [];
        this.selectedLogId = null;
        this.adminFarmId = null;
        this.adminUserId = null;
    }
};
