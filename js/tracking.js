// User and activity tracking via Google Sheets
// This sends anonymous usage data to a Google Sheet for monitoring

const Tracking = {
    // Google Apps Script Web App URL
    WEBHOOK_URL: 'https://script.google.com/macros/s/AKfycbyKIAfkk14Cn12iYXeNQy72AU_RMv0bQSFlm7KRT3bPE35ulwjL7NCTdzwX4oxmthCa/exec',

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
        this.logToFirestore('registration', { email });
    },

    // Track user login
    trackLogin(email) {
        this.trackEvent('login', {
            email: email,
            action: 'login'
        });
        // Also log to Firestore and update last login
        this.logToFirestore('login', { email });
    },

    // Log to Firestore activity log
    async logToFirestore(eventType, details = {}) {
        if (typeof FirebaseAdmin !== 'undefined' && FirebaseAdmin.logActivity) {
            try {
                await FirebaseAdmin.logActivity(eventType, details);
            } catch (e) {
                console.log('Firestore logging error:', e);
            }
        }
    },

    // Update last login in Firestore
    async updateLastLogin() {
        if (typeof FirebaseAdmin !== 'undefined' && FirebaseAdmin.updateLastLogin && typeof FirebaseAuth !== 'undefined') {
            const user = FirebaseAuth.getCurrentUser();
            if (user) {
                try {
                    await FirebaseAdmin.updateLastLogin(user.uid);
                } catch (e) {
                    console.log('Update last login error:', e);
                }
            }
        }
    },

    // Track spreading session start
    trackSpreadingStart(settings) {
        this.trackEvent('spreading_start', {
            targetRate: settings.targetRate,
            spreadWidth: settings.spreadWidth,
            action: 'start_spreading'
        });
        this.logToFirestore('spreading_start', {
            targetRate: settings.targetRate,
            spreadWidth: settings.spreadWidth
        });
    },

    // Track spreading session end
    trackSpreadingEnd(log) {
        const details = {
            duration: log.endTime && log.timestamp ?
                (new Date(log.endTime) - new Date(log.timestamp)) / 1000 / 60 : 0, // minutes
            pointCount: log.path ? log.path.length : 0,
            targetRate: log.targetRate,
            spreadWidth: log.spreadWidth,
            action: 'stop_spreading'
        };
        this.trackEvent('spreading_end', details);
        this.logToFirestore('spreading_end', details);
    },

    // Track export
    trackExport(format, logCount) {
        this.trackEvent('export', {
            format: format,
            logCount: logCount,
            action: 'export_data'
        });
        this.logToFirestore('export', { format, logCount });
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
