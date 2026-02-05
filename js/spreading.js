// Spread recording and GPS tracking with speed display

const SpreadingTracker = {
    isTracking: false,
    watchId: null,
    currentLog: null,
    tractorColor: 'red',
    manureColor: 'brown',
    targetRate: null,
    spreadWidth: 50,
    lastPosition: null,
    positionUpdateInterval: 3000, // Update every 3 seconds minimum
    currentSpeed: 0,
    priorSessionId: null, // Track if continuing from prior session
    totalDistanceMeters: 0,
    equipmentCapacity: null,
    loadCount: 0,
    // Outlier filtering
    maxSpeedMps: 15, // Max plausible tractor speed: ~33 mph / 15 m/s
    maxAccuracyMeters: 80, // Reject GPS fixes worse than this
    consecutiveRejections: 0,
    maxConsecutiveRejections: 5, // Accept after this many rejections (assume real movement)
    // Field tracking
    currentFieldId: null,
    currentFieldName: null,
    availableFields: [],
    fieldChangePromptShowing: false,
    pendingFieldChange: null,

    async startTracking(tractorColor, manureColor, targetRate, spreadWidth, priorSessionId = null) {
        if (this.isTracking) {
            console.warn('Already tracking');
            return;
        }

        this.tractorColor = tractorColor;
        this.manureColor = manureColor;
        this.targetRate = targetRate || null;
        this.spreadWidth = spreadWidth || 50;
        this.priorSessionId = priorSessionId;
        this.isTracking = true;
        this.lastPosition = null;
        this.currentSpeed = 0;
        this.totalDistanceMeters = 0;
        this.consecutiveRejections = 0;

        // Initialize the current log
        this.currentLog = {
            id: StorageDB.generateId(),
            timestamp: new Date().toISOString(),
            endTime: null,
            tractorColor: tractorColor,
            manureColor: manureColor,
            targetRate: this.targetRate,
            spreadWidth: this.spreadWidth,
            priorSessionId: priorSessionId,
            path: []
        };

        // Initialize map path with width
        MapManager.startPath(manureColor, this.spreadWidth);

        // Load field boundaries if feature enabled
        if (typeof FieldDisplay !== 'undefined') {
            FieldDisplay.loadCurrentUserFields();
        }

        // Update GPS status
        this.updateGpsStatus('waiting', 'Waiting for GPS...');
        this.updateSpeedDisplay(0);

        // Check if geolocation is available
        if (!navigator.geolocation) {
            this.updateGpsStatus('error', 'GPS not available');
            return { success: false, error: 'Geolocation is not supported by your browser.' };
        }

        // Start watching position
        try {
            this.watchId = navigator.geolocation.watchPosition(
                (position) => this.onPositionUpdate(position),
                (error) => this.onPositionError(error),
                {
                    enableHighAccuracy: true,
                    timeout: 30000,
                    maximumAge: 0
                }
            );

            // Track spreading start
            if (typeof Tracking !== 'undefined') {
                Tracking.trackSpreadingStart({
                    targetRate: this.targetRate,
                    spreadWidth: this.spreadWidth
                });
            }

            return { success: true };
        } catch (error) {
            this.updateGpsStatus('error', 'Failed to start GPS');
            return { success: false, error: error.message };
        }
    },

    onPositionUpdate(position) {
        if (!this.isTracking) return;

        const { latitude, longitude, accuracy, heading, speed } = position.coords;
        const timestamp = new Date().toISOString();

        // Update GPS status
        this.updateGpsStatus('active', `GPS Active (±${Math.round(accuracy)}m)`);

        // Update speed display (convert m/s to mph)
        if (speed !== null && !isNaN(speed)) {
            this.currentSpeed = speed * 2.237; // m/s to mph
        } else if (this.lastPosition) {
            const timeDiff = (Date.now() - this.lastPosition.time) / 1000;
            if (timeDiff > 0) {
                const distance = this.calculateDistance(
                    this.lastPosition.lat, this.lastPosition.lng,
                    latitude, longitude
                );
                this.currentSpeed = (distance / timeDiff) * 2.237;
            }
        }
        this.updateSpeedDisplay(this.currentSpeed);

        // Check if this point is a GPS outlier
        if (this.isOutlierPoint(latitude, longitude, accuracy)) {
            this.consecutiveRejections++;
            // Still update tractor marker so user sees GPS state, but don't record
            if (this.consecutiveRejections <= this.maxConsecutiveRejections) {
                this.updateGpsStatus('active', `GPS (±${Math.round(accuracy)}m) - filtering`);
                return;
            }
            // Too many rejections - accept the point (tractor probably really moved)
            console.log('GPS: Accepting point after', this.consecutiveRejections, 'consecutive rejections');
            this.consecutiveRejections = 0;
        } else {
            this.consecutiveRejections = 0;
        }

        // Update tractor position on map
        MapManager.setTractorPosition(latitude, longitude, this.tractorColor);

        // Check if we should add this point (avoid too many points when stationary)
        const shouldAddPoint = this.shouldAddPoint(latitude, longitude);

        if (shouldAddPoint) {
            // Check for field crossing before adding point
            this.checkFieldCrossing(latitude, longitude);

            // Accumulate distance
            if (this.lastPosition) {
                const segmentDist = this.calculateDistance(
                    this.lastPosition.lat, this.lastPosition.lng,
                    latitude, longitude
                );
                this.totalDistanceMeters += segmentDist;
            }

            // Add to path
            MapManager.addPathPoint(latitude, longitude);

            // Add to log
            this.currentLog.path.push({
                lat: latitude,
                lng: longitude,
                time: timestamp,
                accuracy: accuracy,
                heading: heading,
                speed: speed,
                speedMph: this.currentSpeed
            });

            this.lastPosition = { lat: latitude, lng: longitude, time: Date.now() };

            // Update calculated rate display
            this.updateCalcRateDisplay();
        }
    },

    isOutlierPoint(lat, lng, accuracy) {
        // Reject points with very poor GPS accuracy
        if (accuracy && accuracy > this.maxAccuracyMeters) {
            return true;
        }

        // Can't check speed if no previous position
        if (!this.lastPosition) {
            return false;
        }

        // Check implied speed between last valid point and this one
        const distance = this.calculateDistance(
            this.lastPosition.lat, this.lastPosition.lng,
            lat, lng
        );
        const timeDiff = (Date.now() - this.lastPosition.time) / 1000; // seconds

        if (timeDiff <= 0) return false;

        const impliedSpeed = distance / timeDiff; // m/s

        if (impliedSpeed > this.maxSpeedMps) {
            console.log(`GPS outlier rejected: ${distance.toFixed(0)}m in ${timeDiff.toFixed(1)}s = ${(impliedSpeed * 2.237).toFixed(1)}mph (max ${(this.maxSpeedMps * 2.237).toFixed(0)}mph)`);
            return true;
        }

        return false;
    },

    shouldAddPoint(lat, lng) {
        if (!this.lastPosition) {
            return true;
        }

        // Always add if enough time has passed
        const timeSinceLastPoint = Date.now() - this.lastPosition.time;
        if (timeSinceLastPoint >= this.positionUpdateInterval) {
            return true;
        }

        // Add if moved significantly (more than ~5 meters)
        const distance = this.calculateDistance(
            this.lastPosition.lat, this.lastPosition.lng,
            lat, lng
        );

        return distance > 5;
    },

    calculateDistance(lat1, lng1, lat2, lng2) {
        // Haversine formula for distance in meters
        const R = 6371000;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLng = (lng2 - lng1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                  Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                  Math.sin(dLng / 2) * Math.sin(dLng / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    },

    onPositionError(error) {
        let message = 'GPS Error';

        switch (error.code) {
            case error.PERMISSION_DENIED:
                message = 'GPS permission denied';
                break;
            case error.POSITION_UNAVAILABLE:
                message = 'GPS unavailable';
                break;
            case error.TIMEOUT:
                message = 'GPS timeout - retrying...';
                break;
        }

        this.updateGpsStatus('error', message);
        console.error('GPS Error:', error.message);
    },

    updateGpsStatus(status, text) {
        const statusElement = document.getElementById('gps-status');
        if (!statusElement) return;

        const dot = statusElement.querySelector('.status-dot');
        const textEl = statusElement.querySelector('.status-text');

        dot.className = 'status-dot';
        if (status === 'active') {
            dot.classList.add('active');
        } else if (status === 'error') {
            dot.classList.add('error');
        }

        textEl.textContent = text;
    },

    updateSpeedDisplay(speedMph) {
        const speedDisplay = document.getElementById('speed-display');
        if (!speedDisplay) return;

        const speedValue = speedDisplay.querySelector('.speed-value');
        if (speedValue) {
            speedValue.textContent = speedMph.toFixed(1);
        }
    },

    async stopTracking() {
        if (!this.isTracking) {
            console.warn('Not currently tracking');
            return null;
        }

        // Stop watching position
        if (this.watchId !== null) {
            navigator.geolocation.clearWatch(this.watchId);
            this.watchId = null;
        }

        this.isTracking = false;

        // Finalize the log
        this.currentLog.endTime = new Date().toISOString();
        this.currentLog.totalDistanceMeters = this.totalDistanceMeters;

        const totalDistanceFeet = this.totalDistanceMeters * 3.28084;
        const acresCovered = (totalDistanceFeet * this.spreadWidth) / 43560;
        this.currentLog.acresCovered = acresCovered;
        this.currentLog.calculatedRate = this.getCalculatedRate();

        // Save to database (use Firebase if available, fallback to local)
        try {
            const dbHandler = window.FirebaseDB || StorageDB;
            const savedLog = await dbHandler.saveLog(this.currentLog);
            console.log('Spreading log saved:', savedLog);

            // Track spreading end
            if (typeof Tracking !== 'undefined') {
                Tracking.trackSpreadingEnd(this.currentLog);
            }

            // Reset map
            MapManager.reset();

            const log = this.currentLog;
            this.currentLog = null;
            this.priorSessionId = null;

            // Reset field tracking
            this.currentFieldId = null;
            this.currentFieldName = null;
            this.availableFields = [];
            this.fieldChangePromptShowing = false;
            this.pendingFieldChange = null;

            return log;
        } catch (error) {
            console.error('Failed to save spreading log:', error);
            throw error;
        }
    },

    getCalculatedRate() {
        if (!this.equipmentCapacity || !this.loadCount || this.totalDistanceMeters <= 0) {
            return null;
        }
        const totalDistanceFeet = this.totalDistanceMeters * 3.28084;
        const acresCovered = (totalDistanceFeet * this.spreadWidth) / 43560;
        if (acresCovered <= 0) return null;
        return (this.equipmentCapacity * this.loadCount) / acresCovered;
    },

    updateCalcRateDisplay() {
        const calcRateEl = document.getElementById('calc-rate-display');
        if (!calcRateEl) return;

        const rate = this.getCalculatedRate();
        if (rate !== null) {
            calcRateEl.textContent = `${rate.toFixed(0)} gal/ac`;
            calcRateEl.classList.remove('hidden');
        }
    },

    getTrackingStatus() {
        return {
            isTracking: this.isTracking,
            currentLog: this.currentLog,
            pointCount: this.currentLog ? this.currentLog.path.length : 0,
            currentSpeed: this.currentSpeed
        };
    },

    // Field tracking methods
    setFieldInfo(fieldId, fieldName, availableFields) {
        this.currentFieldId = fieldId || null;
        this.currentFieldName = fieldName || null;
        this.availableFields = availableFields || [];
    },

    getFieldAtLocation(lat, lng) {
        for (const field of this.availableFields) {
            if (!field.geojson) continue;
            const polygon = this.getPolygonCoords(field);
            if (polygon.length > 0 && this.pointInPolygon([lat, lng], polygon)) {
                return field;
            }
        }
        return null;
    },

    getPolygonCoords(field) {
        const coords = [];
        if (!field.geojson) return coords;
        const features = field.geojson.features || [field.geojson];
        features.forEach(feature => {
            const geom = feature.geometry || feature;
            if (geom.type === 'Polygon') {
                geom.coordinates[0].forEach(c => coords.push([c[1], c[0]]));
            } else if (geom.type === 'MultiPolygon') {
                geom.coordinates.forEach(poly => {
                    poly[0].forEach(c => coords.push([c[1], c[0]]));
                });
            }
        });
        return coords;
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

    checkFieldCrossing(lat, lng) {
        // Skip if no fields, no current field, or already showing prompt
        if (this.availableFields.length === 0 || this.fieldChangePromptShowing) return;

        const newField = this.getFieldAtLocation(lat, lng);

        // If we're not in any field, or still in the same field, do nothing
        if (!newField) return;
        if (this.currentFieldId && newField.id === this.currentFieldId) return;

        // We've entered a different field - show confirmation
        this.pendingFieldChange = newField;
        this.showFieldChangeConfirmation(newField);
    },

    showFieldChangeConfirmation(newField) {
        this.fieldChangePromptShowing = true;

        // Create modal if it doesn't exist
        let modal = document.getElementById('field-change-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'field-change-modal';
            modal.className = 'modal-overlay';
            modal.innerHTML = `
                <div class="modal-content" style="text-align:center;">
                    <h3 style="margin-bottom:16px;">Field Change Detected</h3>
                    <p id="field-change-message" style="margin-bottom:20px;"></p>
                    <div style="display:flex;gap:12px;">
                        <button class="btn btn-primary" id="confirm-field-change" style="flex:1;">Yes, New Field</button>
                        <button class="btn btn-secondary" id="reject-field-change" style="flex:1;">No, Stay on Current</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);

            document.getElementById('confirm-field-change').addEventListener('click', () => {
                this.handleFieldChangeConfirmed();
            });
            document.getElementById('reject-field-change').addEventListener('click', () => {
                this.handleFieldChangeRejected();
            });
        }

        const fieldName = newField.name || 'Unnamed Field';
        const currentName = this.currentFieldName || 'No Field';
        document.getElementById('field-change-message').innerHTML =
            `You've entered <strong>${fieldName}</strong>.<br><br>Start a new spreading record for this field?<br><small>(Currently spreading on: ${currentName})</small>`;

        modal.classList.remove('hidden');
    },

    async handleFieldChangeConfirmed() {
        const modal = document.getElementById('field-change-modal');
        if (modal) modal.classList.add('hidden');
        this.fieldChangePromptShowing = false;

        if (!this.pendingFieldChange || !this.isTracking) {
            this.pendingFieldChange = null;
            return;
        }

        const newField = this.pendingFieldChange;
        this.pendingFieldChange = null;

        // Save current log
        try {
            if (this.currentLog && this.currentLog.path.length > 0) {
                this.currentLog.endTime = new Date().toISOString();
                this.currentLog.totalDistanceMeters = this.totalDistanceMeters;
                const totalDistanceFeet = this.totalDistanceMeters * 3.28084;
                const acresCovered = (totalDistanceFeet * this.spreadWidth) / 43560;
                this.currentLog.acresCovered = acresCovered;
                this.currentLog.calculatedRate = this.getCalculatedRate();

                const dbHandler = window.FirebaseDB || StorageDB;
                await dbHandler.saveLog(this.currentLog);
                console.log('Previous field log saved');
            }
        } catch (e) {
            console.error('Error saving previous field log:', e);
        }

        // Start new log for new field
        this.currentFieldId = newField.id;
        this.currentFieldName = newField.name || 'Unnamed Field';
        this.totalDistanceMeters = 0;
        this.lastPosition = null;

        this.currentLog = {
            id: StorageDB.generateId(),
            timestamp: new Date().toISOString(),
            endTime: null,
            tractorColor: this.tractorColor,
            manureColor: this.manureColor,
            targetRate: this.targetRate,
            spreadWidth: this.spreadWidth,
            fieldId: newField.id,
            fieldName: this.currentFieldName,
            equipmentId: this.currentLog?.equipmentId,
            equipmentName: this.currentLog?.equipmentName,
            storageId: this.currentLog?.storageId,
            storageName: this.currentLog?.storageName,
            loadCount: this.loadCount,
            equipmentCapacity: this.equipmentCapacity,
            path: []
        };

        // Reset map path for new field
        MapManager.clearPath();
        MapManager.startPath(this.manureColor, this.spreadWidth);
    },

    handleFieldChangeRejected() {
        const modal = document.getElementById('field-change-modal');
        if (modal) modal.classList.add('hidden');
        this.fieldChangePromptShowing = false;
        this.pendingFieldChange = null;
        // Continue with current field - no changes needed
    }
};
