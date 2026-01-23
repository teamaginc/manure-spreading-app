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
            // Calculate speed from positions if not provided
            const timeDiff = (Date.now() - this.lastPosition.time) / 1000; // seconds
            if (timeDiff > 0) {
                const distance = this.calculateDistance(
                    this.lastPosition.lat, this.lastPosition.lng,
                    latitude, longitude
                );
                this.currentSpeed = (distance / timeDiff) * 2.237; // m/s to mph
            }
        }
        this.updateSpeedDisplay(this.currentSpeed);

        // Update tractor position on map
        MapManager.setTractorPosition(latitude, longitude, this.tractorColor);

        // Check if we should add this point (avoid too many points when stationary)
        const shouldAddPoint = this.shouldAddPoint(latitude, longitude);

        if (shouldAddPoint) {
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
        }
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

        // Save to database
        try {
            const savedLog = await StorageDB.saveLog(this.currentLog);
            console.log('Spreading log saved:', savedLog);

            // Reset map
            MapManager.reset();

            const log = this.currentLog;
            this.currentLog = null;
            this.priorSessionId = null;

            return log;
        } catch (error) {
            console.error('Failed to save spreading log:', error);
            throw error;
        }
    },

    getTrackingStatus() {
        return {
            isTracking: this.isTracking,
            currentLog: this.currentLog,
            pointCount: this.currentLog ? this.currentLog.path.length : 0,
            currentSpeed: this.currentSpeed
        };
    }
};
