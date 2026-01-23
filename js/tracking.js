// User and activity tracking via Google Sheets
// This sends anonymous usage data to a Google Sheet for monitoring

const Tracking = {
    // Google Apps Script Web App URL - you'll set this up
    WEBHOOK_URL: '', // Will be set after Google Sheet setup

    // Check if tracking is configured
    isConfigured() {
        return this.WEBHOOK_URL && this.WEBHOOK_URL.length > 0;
    },

    // Generate a unique device ID (persists in localStorage)
    getDeviceId() {
        let deviceId = localStorage.getItem('teamag_device_id');
        if (!deviceId) {
            deviceId = 'device_' + Date.now().toString(36) + Math.random().toString(36).substr(2);
            localStorage.setItem('teamag_device_id', deviceId);
        }
        return deviceId;
    },

    // Send tracking event to Google Sheets
    async trackEvent(eventType, data = {}) {
        if (!this.isConfigured()) {
            console.log('Tracking not configured, skipping:', eventType);
            return;
        }

        const payload = {
            timestamp: new Date().toISOString(),
            deviceId: this.getDeviceId(),
            eventType: eventType,
            userAgent: navigator.userAgent,
            ...data
        };

        try {
            // Use navigator.sendBeacon for reliability, fallback to fetch
            const jsonPayload = JSON.stringify(payload);

            if (navigator.sendBeacon) {
                navigator.sendBeacon(this.WEBHOOK_URL, jsonPayload);
            } else {
                fetch(this.WEBHOOK_URL, {
                    method: 'POST',
                    mode: 'no-cors', // Required for Google Apps Script
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: jsonPayload
                }).catch(err => console.log('Tracking error:', err));
            }
        } catch (error) {
            console.log('Tracking error:', error);
        }
    },

    // Track user registration
    trackRegistration(email) {
        this.trackEvent('registration', {
            email: email,
            action: 'new_account'
        });
    },

    // Track user login
    trackLogin(email) {
        this.trackEvent('login', {
            email: email,
            action: 'login'
        });
    },

    // Track spreading session start
    trackSpreadingStart(settings) {
        this.trackEvent('spreading_start', {
            targetRate: settings.targetRate,
            spreadWidth: settings.spreadWidth,
            action: 'start_spreading'
        });
    },

    // Track spreading session end
    trackSpreadingEnd(log) {
        this.trackEvent('spreading_end', {
            duration: log.endTime && log.timestamp ?
                (new Date(log.endTime) - new Date(log.timestamp)) / 1000 / 60 : 0, // minutes
            pointCount: log.path ? log.path.length : 0,
            targetRate: log.targetRate,
            spreadWidth: log.spreadWidth,
            action: 'stop_spreading'
        });
    },

    // Track export
    trackExport(format, logCount) {
        this.trackEvent('export', {
            format: format,
            logCount: logCount,
            action: 'export_data'
        });
    },

    // Track app open
    trackAppOpen() {
        this.trackEvent('app_open', {
            action: 'open_app',
            platform: /iPhone|iPad|iPod/.test(navigator.userAgent) ? 'iOS' :
                      /Android/.test(navigator.userAgent) ? 'Android' : 'Desktop'
        });
    }
};

// Track app open on load
document.addEventListener('DOMContentLoaded', () => {
    Tracking.trackAppOpen();
});
